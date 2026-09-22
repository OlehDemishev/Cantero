import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PDFDocument } from "pdf-lib";
import type { AuthUser, ImportDrawingSetInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";
import { MAX_DRAWING_SET_UPLOAD_BYTES } from "../common/upload-limits";
import { extractPdfText } from "./pdf-text";
import { findSheetReferences, recognizeSheet, sheetKey, type Confidence, type SheetReference } from "./sheet-recognition";
import { latestPerChain } from "./drawing-sheets.service";

/** Past this, reading every page's text takes long enough to time out the upload request. */
const MAX_PAGES = 300;
/** Scanned pages (no text layer) whose title block is OCR'd per upload — a second or two each. */
const MAX_SCANNED_PAGES_OCR = 60;

export interface SetPageAnalysis {
  page: number;
  sheetNumber: string | null;
  title: string | null;
  discipline: string | null;
  confidence: Confidence | null;
  /** Read by OCR from a scanned page's title block, not from a text layer — worth a closer look. */
  fromScan?: boolean;
  /** Every sheet reference printed on the page; the page's own number is dropped at import, once
   * the person has confirmed what that number is. */
  references: SheetReference[];
}

/**
 * Multi-page PDF drawing sets: upload → a per-page proposal (sheet number, title, discipline read
 * from the title block) → the person corrects it → import splits the PDF into one DrawingSheet per
 * page. A page whose number already exists in the project comes in as that sheet's next revision,
 * so re-uploading an updated set revises what changed instead of duplicating the log.
 */
@Injectable()
export class DrawingSetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async analyze(companyId: string, actor: AuditActor, projectId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    if (file.mimetype !== "application/pdf") throw new BadRequestException("A drawing set has to be a PDF");
    if (file.size > MAX_DRAWING_SET_UPLOAD_BYTES) throw new BadRequestException("The drawing set exceeds the 100MB limit");
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
    if (!project) throw new NotFoundException("Project not found");

    let pages: Awaited<ReturnType<typeof extractPdfText>>;
    try {
      pages = await extractPdfText(file.buffer, MAX_PAGES + 1, { ocrScans: { maxPages: MAX_SCANNED_PAGES_OCR } });
    } catch {
      throw new BadRequestException("This PDF couldn't be read — it may be damaged or password-protected");
    }
    if (pages.length === 0) throw new BadRequestException("This PDF has no pages");
    if (pages.length > MAX_PAGES) throw new BadRequestException(`A drawing set can have at most ${MAX_PAGES} pages — split it and upload the parts`);

    const analysis: SetPageAnalysis[] = pages.map((p) => ({
      page: p.pageNumber,
      ...recognizeSheet(p.words),
      ...(p.fromScan ? { fromScan: true } : {}),
      // Only the title block of a scan is read, so it has no references worth linking.
      references: p.fromScan ? [] : findSheetReferences(p.words, null),
    }));
    const stored = await this.storage.save(companyId, file.originalname, file.buffer);
    const set = await this.prisma.drawingSet.create({
      data: {
        companyId,
        projectId,
        fileName: file.originalname.slice(0, 200),
        storageKey: stored.storageKey,
        pageCount: pages.length,
        analysis: analysis as unknown as object,
        uploadedByUserId: actor.userId,
      },
    });
    return this.present(set);
  }

  /** The proposal for review, each recognized number matched against the project's sheets. */
  async get(user: AuthUser, id: string) {
    return this.present(await this.findOrThrow(user, id));
  }

  async import(user: AuthUser, id: string, input: ImportDrawingSetInput) {
    const { companyId } = user;
    const actor: AuditActor = { userId: user.userId, name: user.name };
    const set = await this.findOrThrow(user, id);
    if (set.importedAt) throw new ConflictException("This drawing set has already been imported");

    const seenPages = new Set<number>();
    const seenKeys = new Map<string, number>();
    for (const p of input.pages) {
      if (p.page > set.pageCount) throw new BadRequestException(`The set has no page ${p.page}`);
      if (seenPages.has(p.page)) throw new BadRequestException(`Page ${p.page} is listed twice`);
      seenPages.add(p.page);
      const key = sheetKey(p.sheetNumber);
      if (seenKeys.has(key)) throw new BadRequestException(`Pages ${seenKeys.get(key)} and ${p.page} both have sheet number ${p.sheetNumber}`);
      seenKeys.set(key, p.page);
    }

    const source = await PDFDocument.load(await this.storage.read(set.storageKey)).catch(() => {
      throw new BadRequestException("This PDF can't be split — it may be password-protected");
    });
    const analysis = new Map((set.analysis as unknown as SetPageAnalysis[]).map((a) => [a.page, a]));
    const existing = await this.currentSheetsByKey(companyId, set.projectId);

    // Split first: storage writes can't be rolled back, but no sheet row exists until all succeed.
    const files: { page: ImportDrawingSetInput["pages"][number]; storageKey: string }[] = [];
    for (const page of input.pages) {
      const single = await PDFDocument.create();
      const [copied] = await single.copyPages(source, [page.page - 1]);
      single.addPage(copied);
      const bytes = Buffer.from(await single.save());
      const stored = await this.storage.save(companyId, `${set.fileName.replace(/\.pdf$/i, "")}-p${page.page}.pdf`, bytes);
      files.push({ page, storageKey: stored.storageKey });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // Claimed inside the transaction, so a double-submitted import can't create the sheets twice.
      const claimed = await tx.drawingSet.updateMany({ where: { id: set.id, importedAt: null }, data: { importedAt: new Date() } });
      if (claimed.count === 0) throw new ConflictException("This drawing set has already been imported");
      const rows: { id: string; sheetNumber: string; revised: boolean }[] = [];
      for (const { page, storageKey } of files) {
        const key = sheetKey(page.sheetNumber);
        const current = existing.get(key);
        const sheet = await tx.drawingSheet.create({
          data: {
            companyId,
            projectId: set.projectId,
            sheetNumber: current?.sheetNumber ?? page.sheetNumber,
            title: page.title || current?.title || null,
            discipline: page.discipline || current?.discipline || null,
            revision: page.revision || null,
            storageKey,
            mimeType: "application/pdf",
            uploadedByUserId: actor.userId,
            drawingSetId: set.id,
            sourcePage: page.page,
            ...(current ? { version: current.version + 1, rootSheetId: current.rootSheetId ?? current.id } : {}),
          },
        });
        const refs = (analysis.get(page.page)?.references ?? []).filter((r) => r.targetKey !== key);
        if (refs.length > 0) {
          await tx.drawingSheetLink.createMany({ data: refs.map((r) => ({ sheetId: sheet.id, targetKey: r.targetKey, label: r.label, x: r.x, y: r.y, width: r.width, height: r.height })) });
        }
        rows.push({ id: sheet.id, sheetNumber: sheet.sheetNumber, revised: Boolean(current) });
      }
      return rows;
    });

    const revised = created.filter((r) => r.revised).length;
    this.audit.record(
      companyId,
      actor,
      "drawing_set.imported",
      "DrawingSet",
      set.id,
      `Imported ${created.length} sheets from ${set.fileName} (${created.length - revised} new, ${revised} revised)`,
    );
    return { created: created.length - revised, revised, sheets: created };
  }

  /** The uploaded PDF, for previewing pages while reviewing. */
  async file(user: AuthUser, id: string): Promise<Buffer> {
    const set = await this.findOrThrow(user, id);
    return this.storage.read(set.storageKey);
  }

  async discard(user: AuthUser, id: string) {
    const set = await this.findOrThrow(user, id);
    if (set.importedAt) throw new ConflictException("An imported drawing set stays as the record of where its sheets came from");
    await this.prisma.drawingSet.delete({ where: { id } });
    return { ok: true };
  }

  private async present(set: { id: string; companyId: string; projectId: string; fileName: string; pageCount: number; importedAt: Date | null; analysis: unknown }) {
    const existing = await this.currentSheetsByKey(set.companyId, set.projectId);
    const pages = (set.analysis as unknown as SetPageAnalysis[]).map(({ references, ...p }) => {
      const match = p.sheetNumber ? existing.get(sheetKey(p.sheetNumber)) : undefined;
      return {
        ...p,
        referenceCount: references.length,
        existingSheet: match ? { id: match.id, sheetNumber: match.sheetNumber, revision: match.revision, version: match.version } : null,
      };
    });
    return { id: set.id, projectId: set.projectId, fileName: set.fileName, pageCount: set.pageCount, importedAt: set.importedAt, pages };
  }

  private async currentSheetsByKey(companyId: string, projectId: string) {
    const sheets = await this.prisma.drawingSheet.findMany({ where: { companyId, projectId } });
    return new Map(latestPerChain(sheets).map((s) => [sheetKey(s.sheetNumber), s]));
  }

  /** Looked up by its own id, so the route-level project guard can't see the project: checked here. */
  private async findOrThrow(user: AuthUser, id: string) {
    const set = await this.prisma.drawingSet.findFirst({ where: { id, companyId: user.companyId } });
    if (!set) throw new NotFoundException("Drawing set not found");
    await this.projectAccess.assertAccess(user.companyId, set.projectId, user.userId, user.role);
    return set;
  }
}
