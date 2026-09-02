import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateDrawingSheetInput, UpdateDrawingSheetInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

@Injectable()
export class DrawingSheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /** Latest version per chain, same "group by COALESCE(rootId, id), take max(version)" convention as DocumentsService.list(). */
  async list(companyId: string, projectId: string) {
    const sheets = await this.prisma.drawingSheet.findMany({
      where: { companyId, projectId },
      orderBy: [{ sheetNumber: "asc" }, { createdAt: "desc" }],
    });

    const latestByChain = new Map<string, (typeof sheets)[number]>();
    for (const sheet of sheets) {
      const chainKey = sheet.rootSheetId ?? sheet.id;
      const existing = latestByChain.get(chainKey);
      if (!existing || sheet.version > existing.version) latestByChain.set(chainKey, sheet);
    }

    return Array.from(latestByChain.values()).sort((a, b) => a.sheetNumber.localeCompare(b.sheetNumber));
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
