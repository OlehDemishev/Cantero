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

  list(companyId: string, projectId: string) {
    return this.prisma.drawingSheet.findMany({
      where: { companyId, projectId },
      orderBy: [{ sheetNumber: "asc" }, { createdAt: "desc" }],
    });
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
