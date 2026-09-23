import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { Prisma, type DrawingSet } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import type { AuthUser, ImportDrawingSetInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";
import { DRAWING_SETS_QUEUE } from "../common/queue/queue.module";
import { MAX_DRAWING_SET_UPLOAD_BYTES } from "../common/upload-limits";
import { analyzePdf, MAX_SET_PAGES, PdfAnalysisError, type SetPageAnalysis } from "./pdf-analysis";
import { sheetKey } from "./sheet-recognition";
import { latestPerChain } from "./drawing-sheets.service";

export type { SetPageAnalysis } from "./pdf-analysis";

/** What the drawing-sets queue runs (DrawingSetsProcessor). */
export type DrawingSetJob = { kind: "analyze"; setId: string } | { kind: "import"; setId: string } | { kind: "backfill-links" };

/** The reviewed pages an import job splits out, and who asked — the audit entry names them. */
interface ImportRequest {
  actor: AuditActor;
  pages: ImportDrawingSetInput["pages"];
}

/** How often, at most, reading progress is written — a bar that moves once a second is enough. */
const PROGRESS_INTERVAL_MS = 1000;
/** Sheets whose links the one-off backfill reads per job; the next batch is queued after. */
const BACKFILL_BATCH = 25;

/**
 * Multi-page PDF drawing sets: upload → a per-page proposal (sheet number, title, discipline read
 * from the title block) → the person corrects it → import splits the PDF into one DrawingSheet per
 * page. A page whose number already exists in the project comes in as that sheet's next revision,
 * so re-uploading an updated set revises what changed instead of duplicating the log.
 *
 * Reading the set and splitting it both run on the drawing-sets queue rather than in the request:
 * a set of scans takes minutes, past any proxy's timeout, and pdf.js would hold up the API for
 * everyone meanwhile. The set's status and pagesRead are what the apps poll; the uploader gets a
 * notification when it's ready for review.
 */
@Injectable()
export class DrawingSetsService implements OnModuleInit {
  private readonly logger = new Logger(DrawingSetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly projectAccess: ProjectAccessService,
    @InjectQueue(DRAWING_SETS_QUEUE) private readonly queue: Queue<DrawingSetJob>,
  ) {}

  /** Starts the one-off pass that reads links on sheets uploaded before links were read — it finds
   * nothing to do once they're all done, so queuing it on every start is harmless. */
  async onModuleInit() {
    await this.queue
      .add("backfill-links", { kind: "backfill-links" }, { jobId: "backfill-links", removeOnComplete: true, removeOnFail: true })
      .catch((err) => this.logger.warn(`Couldn't queue the sheet-link backfill: ${err instanceof Error ? err.message : String(err)}`));
  }

  /** Stores the PDF and queues its reading; the set comes back "analyzing" straight away. */
  async analyze(companyId: string, actor: AuditActor, projectId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    if (file.mimetype !== "application/pdf") throw new BadRequestException("A drawing set has to be a PDF");
    if (file.size > MAX_DRAWING_SET_UPLOAD_BYTES) throw new BadRequestException("The drawing set exceeds the 100MB limit");
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
    if (!project) throw new NotFoundException("Project not found");

    const stored = await this.storage.save(companyId, file.originalname, file.buffer);
    const set = await this.prisma.drawingSet.create({
      data: {
        companyId,
        projectId,
        fileName: file.originalname.slice(0, 200),
        storageKey: stored.storageKey,
        pageCount: 0,
        analysis: [],
        status: "analyzing",
        uploadedByUserId: actor.userId,
      },
    });
    await this.queue.add("analyze", { kind: "analyze", setId: set.id }, { jobId: `analyze-${set.id}`, attempts: 2, backoff: { type: "fixed", delay: 5000 }, removeOnComplete: true, removeOnFail: true });
    return this.present(set);
  }

  /** The queued half of analyze(): reads every page on a worker thread, reporting progress. */
  async runAnalysis(setId: string) {
    const set = await this.prisma.drawingSet.findUnique({ where: { id: setId } });
    if (!set || set.status !== "analyzing") return;
    const pdf = await this.storage.read(set.storageKey);

    // Progress writes are chained so a late one can't land after the final state.
    let progress: Promise<unknown> = Promise.resolve();
    let lastWrite = 0;
    const onProgress = (done: number, total: number) => {
      if (done < total && Date.now() - lastWrite < PROGRESS_INTERVAL_MS) return;
      lastWrite = Date.now();
      progress = progress.then(() => this.prisma.drawingSet.update({ where: { id: setId }, data: { pagesRead: done, pageCount: total } })).catch(() => undefined);
    };

    try {
      const result = await analyzePdf({ kind: "set", pdf }, onProgress);
      await progress;
      const pages = result.kind === "set" ? result.pages : [];
      await this.prisma.drawingSet.update({
        where: { id: setId },
        data: { status: "ready", analysis: pages as unknown as object, pageCount: pages.length, pagesRead: pages.length, error: null, finishedAt: new Date() },
      });
    } catch (err) {
      await progress;
      // A PDF that can't be read won't read on a second try either; anything else is retried.
      if (err instanceof PdfAnalysisError && err.code !== "failed") return this.markFailed(setId, err.code);
      throw err;
    }
  }

  /** The set can't be read — shown to the person with a way to discard it. */
  async markFailed(setId: string, code: string) {
    await this.prisma.drawingSet.updateMany({ where: { id: setId, status: "analyzing" }, data: { status: "failed", error: code, finishedAt: new Date() } });
  }

  /** The proposal for review, each recognized number matched against the project's sheets. */
  async get(user: AuthUser, id: string) {
    return this.present(await this.findOrThrow(user, id));
  }

  /** The project's sets still in progress or awaiting review — so a person who left the page (or
   * followed the notification) finds theirs again. */
  async listOpen(user: AuthUser, projectId: string) {
    await this.projectAccess.assertAccess(user.companyId, projectId, user.userId, user.role);
    const sets = await this.prisma.drawingSet.findMany({
      where: { companyId: user.companyId, projectId, status: { in: ["analyzing", "ready", "importing", "failed"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return sets.map((s) => this.summary(s));
  }

  /** Checks the reviewed pages and queues the split; the set comes back "importing". */
  async import(user: AuthUser, id: string, input: ImportDrawingSetInput) {
    const set = await this.findOrThrow(user, id);
    if (set.importedAt || set.status === "imported") throw new ConflictException("This drawing set has already been imported");
    if (set.status === "importing") throw new ConflictException("This drawing set is already being imported");
    if (set.status !== "ready") throw new ConflictException("This drawing set hasn't been read yet");

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

    const request: ImportRequest = { actor: { userId: user.userId, name: user.name }, pages: input.pages };
    // Claimed atomically, so a double-submitted import queues one split, not two.
    const claimed = await this.prisma.drawingSet.updateMany({
      where: { id, status: "ready", importedAt: null },
      data: { status: "importing", importPages: request as unknown as object, error: null },
    });
    if (claimed.count === 0) throw new ConflictException("This drawing set is already being imported");
    await this.queue.add("import", { kind: "import", setId: id }, { jobId: `import-${id}-${Date.now()}`, removeOnComplete: true, removeOnFail: true });
    return this.present({ ...set, status: "importing", error: null });
  }

  /** The queued half of import(): splits the PDF into one stored file per reviewed page, then
   * creates the sheets (revising existing numbers) and their links in one transaction. */
  async runImport(setId: string) {
    const set = await this.prisma.drawingSet.findUnique({ where: { id: setId } });
    if (!set || set.status !== "importing" || !set.importPages) return;
    const { actor, pages } = set.importPages as unknown as ImportRequest;

    try {
      const source = await PDFDocument.load(await this.storage.read(set.storageKey));
      const analysis = new Map((set.analysis as unknown as SetPageAnalysis[]).map((a) => [a.page, a]));
      const existing = await this.currentSheetsByKey(set.companyId, set.projectId);

      // Split first: storage writes can't be rolled back, but no sheet row exists until all succeed.
      const files: { page: ImportDrawingSetInput["pages"][number]; storageKey: string }[] = [];
      for (const page of pages) {
        const single = await PDFDocument.create();
        const [copied] = await single.copyPages(source, [page.page - 1]);
        single.addPage(copied);
        const bytes = Buffer.from(await single.save());
        const stored = await this.storage.save(set.companyId, `${set.fileName.replace(/\.pdf$/i, "")}-p${page.page}.pdf`, bytes);
        files.push({ page, storageKey: stored.storageKey });
      }

      const created = await this.prisma.$transaction(async (tx) => {
        // Claimed inside the transaction, so the sheets can't be created twice.
        const claimed = await tx.drawingSet.updateMany({ where: { id: set.id, importedAt: null }, data: { importedAt: new Date() } });
        if (claimed.count === 0) throw new ConflictException("This drawing set has already been imported");
        const rows: { id: string; sheetNumber: string; revised: boolean }[] = [];
        for (const { page, storageKey } of files) {
          const key = sheetKey(page.sheetNumber);
          const current = existing.get(key);
          const sheet = await tx.drawingSheet.create({
            data: {
              companyId: set.companyId,
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
              linksScannedAt: new Date(),
              ...(current ? { version: current.version + 1, rootSheetId: current.rootSheetId ?? current.id } : {}),
            },
          });
          const refs = (analysis.get(page.page)?.references ?? []).filter((r) => r.targetKey !== key);
          if (refs.length > 0) {
            await tx.drawingSheetLink.createMany({ data: refs.map((r) => ({ sheetId: sheet.id, targetKey: r.targetKey, label: r.label, x: r.x, y: r.y, width: r.width, height: r.height })) });
          }
          rows.push({ id: sheet.id, sheetNumber: sheet.sheetNumber, revised: Boolean(current) });
        }
        const revised = rows.filter((r) => r.revised).length;
        await tx.drawingSet.update({
          where: { id: set.id },
          data: { status: "imported", importResult: { created: rows.length - revised, revised }, finishedAt: new Date() },
        });
        return rows;
      });

      const revised = created.filter((r) => r.revised).length;
      this.audit.record(
        set.companyId,
        actor,
        "drawing_set.imported",
        "DrawingSet",
        set.id,
        `Imported ${created.length} sheets from ${set.fileName} (${created.length - revised} new, ${revised} revised)`,
      );
    } catch (err) {
      // Back to review with the pages as they were, so the person can try again.
      this.logger.warn(`Importing drawing set ${setId} failed: ${err instanceof Error ? err.message : String(err)}`);
      await this.prisma.drawingSet.updateMany({ where: { id: setId, status: "importing" }, data: { status: "ready", error: "import-failed", importPages: Prisma.DbNull } });
    }
  }

  /**
   * One batch of the one-off pass over sheets uploaded before references were read: reads each
   * PDF's links on a worker thread and marks it done (a sheet that can't be read too, so a bad
   * file isn't retried forever). Returns whether sheets may remain.
   */
  async backfillLinks(): Promise<boolean> {
    const sheets = await this.prisma.drawingSheet.findMany({
      where: { linksScannedAt: null },
      select: { id: true, sheetNumber: true, storageKey: true, mimeType: true },
      orderBy: { createdAt: "asc" },
      take: BACKFILL_BATCH,
    });
    for (const sheet of sheets) {
      if (sheet.mimeType === "application/pdf") {
        try {
          const result = await analyzePdf({ kind: "links", pdf: await this.storage.read(sheet.storageKey), ownSheetNumber: sheet.sheetNumber });
          const refs = result.kind === "links" ? result.references : [];
          if (refs.length > 0) {
            await this.prisma.drawingSheetLink.createMany({ data: refs.map((r) => ({ sheetId: sheet.id, targetKey: r.targetKey, label: r.label, x: r.x, y: r.y, width: r.width, height: r.height })) });
          }
        } catch (err) {
          this.logger.warn(`Couldn't read sheet references from ${sheet.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      await this.prisma.drawingSheet.update({ where: { id: sheet.id }, data: { linksScannedAt: new Date() } });
    }
    if (sheets.length === BACKFILL_BATCH) {
      await this.queue.add("backfill-links", { kind: "backfill-links" }, { jobId: `backfill-links-${Date.now()}`, removeOnComplete: true, removeOnFail: true });
      return true;
    }
    return false;
  }

  /** The uploaded PDF, for previewing pages while reviewing. */
  async file(user: AuthUser, id: string): Promise<Buffer> {
    const set = await this.findOrThrow(user, id);
    return this.storage.read(set.storageKey);
  }

  async discard(user: AuthUser, id: string) {
    const set = await this.findOrThrow(user, id);
    if (set.importedAt || set.status === "imported") throw new ConflictException("An imported drawing set stays as the record of where its sheets came from");
    if (set.status === "importing") throw new ConflictException("This drawing set is being imported");
    // A set still being read is deleted too; its job finds nothing and stops.
    await this.prisma.drawingSet.delete({ where: { id } });
    return { ok: true };
  }

  private summary(set: Pick<DrawingSet, "id" | "projectId" | "fileName" | "pageCount" | "pagesRead" | "status" | "error" | "importedAt" | "importResult" | "createdAt">) {
    return {
      id: set.id,
      projectId: set.projectId,
      fileName: set.fileName,
      status: set.status,
      pageCount: set.pageCount,
      pagesRead: set.pagesRead,
      error: set.error,
      importedAt: set.importedAt,
      importResult: set.importResult as { created: number; revised: number } | null,
      createdAt: set.createdAt,
      maxPages: MAX_SET_PAGES,
    };
  }

  private async present(set: DrawingSet) {
    const summary = this.summary(set);
    if (set.status === "analyzing" || set.status === "failed") return { ...summary, pages: [] };
    const existing = await this.currentSheetsByKey(set.companyId, set.projectId);
    const pages = (set.analysis as unknown as SetPageAnalysis[]).map(({ references, ...p }) => {
      const match = p.sheetNumber ? existing.get(sheetKey(p.sheetNumber)) : undefined;
      return {
        ...p,
        referenceCount: references.length,
        existingSheet: match ? { id: match.id, sheetNumber: match.sheetNumber, revision: match.revision, version: match.version } : null,
      };
    });
    return { ...summary, pages };
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
