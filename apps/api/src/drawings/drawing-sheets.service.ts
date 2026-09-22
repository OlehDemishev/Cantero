import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { AuthUser, CreateDrawingSheetInput, UpdateDrawingSheetInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";
import { extractPdfText } from "./pdf-text";
import { findSheetReferences, sheetKey } from "./sheet-recognition";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/** Latest version per chain, same "group by COALESCE(rootId, id), take max(version)" convention as DocumentsService.list(). */
export function latestPerChain<T extends { id: string; rootSheetId: string | null; version: number }>(sheets: T[]): T[] {
  const latestByChain = new Map<string, T>();
  for (const sheet of sheets) {
    const chainKey = sheet.rootSheetId ?? sheet.id;
    const existing = latestByChain.get(chainKey);
    if (!existing || sheet.version > existing.version) latestByChain.set(chainKey, sheet);
  }
  return Array.from(latestByChain.values());
}

@Injectable()
export class DrawingSheetsService {
  private readonly logger = new Logger(DrawingSheetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async list(companyId: string, projectId: string) {
    const sheets = await this.prisma.drawingSheet.findMany({ where: { companyId, projectId } });
    return latestPerChain(sheets).sort((a, b) => a.sheetNumber.localeCompare(b.sheetNumber));
  }

  /**
   * The sheet's clickable references to other sheets, each resolved to that sheet's current
   * version (unresolved ones — a sheet not uploaded, or a false match like a room number — are
   * left out), plus the current sheets that reference this one.
   */
  async links(user: AuthUser, id: string) {
    const sheet = await this.findOrThrow(user.companyId, id);
    await this.projectAccess.assertAccess(user.companyId, sheet.projectId, user.userId, user.role);
    const current = latestPerChain(await this.prisma.drawingSheet.findMany({ where: { companyId: user.companyId, projectId: sheet.projectId } }));
    const byKey = new Map(current.map((s) => [sheetKey(s.sheetNumber), s]));

    const outgoing = (await this.prisma.drawingSheetLink.findMany({ where: { sheetId: id } }))
      .map((l) => ({ ...l, target: byKey.get(l.targetKey) }))
      .filter((l) => l.target && l.target.id !== id)
      .map(({ target, targetKey: _key, sheetId: _sheet, ...l }) => ({ ...l, targetSheetId: target!.id, targetSheetNumber: target!.sheetNumber, targetTitle: target!.title }));

    const currentIds = new Set(current.map((s) => s.id));
    const incoming = await this.prisma.drawingSheetLink.groupBy({
      by: ["sheetId"],
      where: { targetKey: sheetKey(sheet.sheetNumber), sheet: { companyId: user.companyId, projectId: sheet.projectId } },
      _count: { _all: true },
    });
    const referencedBy = incoming
      .filter((g) => currentIds.has(g.sheetId) && g.sheetId !== id)
      .map((g) => {
        const from = current.find((s) => s.id === g.sheetId)!;
        return { sheetId: from.id, sheetNumber: from.sheetNumber, title: from.title, count: g._count._all };
      })
      .sort((a, b) => a.sheetNumber.localeCompare(b.sheetNumber));

    return { outgoing, referencedBy };
  }

  /** Reads a single-sheet PDF's references to other sheets. Best effort: a sheet without a text
   * layer (a scan) or one pdf.js can't read still uploads, just without links. */
  private async storeLinks(sheetId: string, sheetNumber: string, file: Express.Multer.File) {
    if (file.mimetype !== "application/pdf") return;
    try {
      const [page] = await extractPdfText(file.buffer, 1);
      const refs = page ? findSheetReferences(page.words, sheetNumber) : [];
      if (refs.length > 0) {
        await this.prisma.drawingSheetLink.createMany({ data: refs.map((r) => ({ sheetId, targetKey: r.targetKey, label: r.label, x: r.x, y: r.y, width: r.width, height: r.height })) });
      }
    } catch (err) {
      this.logger.warn(`Couldn't read sheet references from ${sheetId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  async get(companyId: string, id: string) {
    return this.findOrThrow(companyId, id);
  }

  async upload(
    companyId: string,
    actor: AuditActor,
    projectId: string,
    file: Express.Multer.File,
    input: CreateDrawingSheetInput,
  ) {
    if (!file) throw new BadRequestException("No file provided");
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) throw new BadRequestException("Unsupported file type — upload a PDF, JPEG, PNG, or WebP");
    if (file.size > MAX_FILE_SIZE_BYTES) throw new BadRequestException("File exceeds the 25MB limit");

    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const stored = await this.storage.save(companyId, file.originalname, file.buffer);
    const sheet = await this.prisma.drawingSheet.create({
      data: {
        companyId,
        projectId,
        sheetNumber: input.sheetNumber,
        discipline: input.discipline,
        title: input.title,
        revision: input.revision,
        revisionDate: input.revisionDate ? new Date(input.revisionDate) : undefined,
        storageKey: stored.storageKey,
        mimeType: file.mimetype,
        uploadedByUserId: actor.userId,
      },
    });

    await this.storeLinks(sheet.id, sheet.sheetNumber, file);
    this.audit.record(companyId, actor, "drawing_sheet.uploaded", "DrawingSheet", sheet.id, `Uploaded sheet ${sheet.sheetNumber}`);
    return sheet;
  }

  /** Uploads a new revision of an existing sheet, chained via rootSheetId — same version-chain
   * shape as DocumentsService.replace(). The prior version's row (and its annotations/RFI/punch-
   * list pins) is left untouched; list() will only surface the new one going forward. */
  async supersede(
    companyId: string,
    actor: AuditActor,
    id: string,
    file: Express.Multer.File,
    input: { revision?: string; revisionDate?: string },
  ) {
    if (!file) throw new BadRequestException("No file provided");
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) throw new BadRequestException("Unsupported file type — upload a PDF, JPEG, PNG, or WebP");
    if (file.size > MAX_FILE_SIZE_BYTES) throw new BadRequestException("File exceeds the 25MB limit");

    const current = await this.findOrThrow(companyId, id);
    const rootId = current.rootSheetId ?? current.id;
    const stored = await this.storage.save(companyId, file.originalname, file.buffer);

    const sheet = await this.prisma.drawingSheet.create({
      data: {
        companyId,
        projectId: current.projectId,
        sheetNumber: current.sheetNumber,
        discipline: current.discipline,
        title: current.title,
        revision: input.revision ?? current.revision,
        revisionDate: input.revisionDate ? new Date(input.revisionDate) : undefined,
        storageKey: stored.storageKey,
        mimeType: file.mimetype,
        uploadedByUserId: actor.userId,
        version: current.version + 1,
        rootSheetId: rootId,
      },
    });

    await this.storeLinks(sheet.id, sheet.sheetNumber, file);
    this.audit.record(
      companyId,
      actor,
      "drawing_sheet.superseded",
      "DrawingSheet",
      sheet.id,
      `Uploaded revision ${sheet.revision ?? sheet.version} of sheet ${sheet.sheetNumber}`,
    );
    return sheet;
  }

  /** Full version chain for a sheet, newest first. */
  async versions(companyId: string, id: string) {
    const current = await this.findOrThrow(companyId, id);
    const rootId = current.rootSheetId ?? current.id;
    return this.prisma.drawingSheet.findMany({
      where: { companyId, OR: [{ id: rootId }, { rootSheetId: rootId }] },
      orderBy: { version: "desc" },
    });
  }

  async update(companyId: string, id: string, input: UpdateDrawingSheetInput) {
    await this.findOrThrow(companyId, id);
    return this.prisma.drawingSheet.update({
      where: { id },
      data: {
        ...input,
        revisionDate: input.revisionDate === null ? null : input.revisionDate ? new Date(input.revisionDate) : undefined,
      },
    });
  }

  async delete(companyId: string, actor: AuditActor, id: string) {
    const sheet = await this.findOrThrow(companyId, id);
    await this.prisma.drawingSheet.delete({ where: { id } });
    this.audit.record(companyId, actor, "drawing_sheet.deleted", "DrawingSheet", id, `Deleted sheet ${sheet.sheetNumber}`);
    return { ok: true };
  }

  async download(companyId: string, id: string) {
    const sheet = await this.findOrThrow(companyId, id);
    const buffer = await this.storage.read(sheet.storageKey);
    return { buffer, mimeType: sheet.mimeType };
  }

  private async findOrThrow(companyId: string, id: string) {
    const sheet = await this.prisma.drawingSheet.findFirst({ where: { id, companyId } });
    if (!sheet) throw new NotFoundException("Drawing sheet not found");
    return sheet;
  }
}
