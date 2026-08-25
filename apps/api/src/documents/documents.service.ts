import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { DocumentCategory } from "@cantero/shared";
import { documentCategorySchema } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — contracts/photos, not video

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/zip",
]);

export interface DocumentListFilter {
  projectId?: string;
  invoiceId?: string;
  punchListItemId?: string;
  dailyLogId?: string;
  incidentReportId?: string;
  warrantyClaimId?: string;
  subcontractorDocumentId?: string;
  deficiencyId?: string;
  category?: string;
  search?: string;
  tag?: string;
}

export interface DocumentAttachmentMeta {
  projectId?: string;
  invoiceId?: string;
  punchListItemId?: string;
  dailyLogId?: string;
  incidentReportId?: string;
  warrantyClaimId?: string;
  subcontractorDocumentId?: string;
  deficiencyId?: string;
  category?: string;
  tags?: string[];
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /** Latest version per chain, excluding soft-deleted documents. */
  async list(companyId: string, filter: DocumentListFilter) {
    const category = filter.category ? documentCategorySchema.parse(filter.category) : undefined;

    const docs = await this.prisma.document.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.invoiceId ? { invoiceId: filter.invoiceId } : {}),
        ...(filter.punchListItemId ? { punchListItemId: filter.punchListItemId } : {}),
        ...(filter.dailyLogId ? { dailyLogId: filter.dailyLogId } : {}),
        ...(filter.incidentReportId ? { incidentReportId: filter.incidentReportId } : {}),
        ...(filter.warrantyClaimId ? { warrantyClaimId: filter.warrantyClaimId } : {}),
        ...(filter.subcontractorDocumentId ? { subcontractorDocumentId: filter.subcontractorDocumentId } : {}),
        ...(filter.deficiencyId ? { deficiencyId: filter.deficiencyId } : {}),
        ...(category ? { category } : {}),
        ...(filter.tag ? { tags: { has: filter.tag } } : {}),
        ...(filter.search ? { name: { contains: filter.search, mode: "insensitive" as const } } : {}),
      },
      include: { uploadedBy: { select: { id: true, name: true } }, project: true },
      orderBy: { createdAt: "desc" },
    });

    const latestByChain = new Map<string, (typeof docs)[number]>();
    for (const doc of docs) {
      const chainKey = doc.rootDocumentId ?? doc.id;
      const existing = latestByChain.get(chainKey);
      if (!existing || doc.version > existing.version) latestByChain.set(chainKey, doc);
    }

    return Array.from(latestByChain.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async upload(
    companyId: string,
    uploadedByUserId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
    meta: DocumentAttachmentMeta,
  ) {
    this.validateFile(file);
    if (meta.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: meta.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
    }
    if (meta.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({ where: { id: meta.invoiceId, companyId } });
      if (!invoice) throw new NotFoundException("Invoice not found");
    }
    if (meta.punchListItemId) {
      const item = await this.prisma.punchListItem.findFirst({ where: { id: meta.punchListItemId, companyId } });
      if (!item) throw new NotFoundException("Punch list item not found");
    }
    if (meta.dailyLogId) {
      const log = await this.prisma.dailyLog.findFirst({ where: { id: meta.dailyLogId, companyId } });
      if (!log) throw new NotFoundException("Daily log not found");
    }
    if (meta.incidentReportId) {
      const incident = await this.prisma.incidentReport.findFirst({ where: { id: meta.incidentReportId, companyId } });
      if (!incident) throw new NotFoundException("Incident report not found");
    }
    if (meta.warrantyClaimId) {
      const claim = await this.prisma.warrantyClaim.findFirst({ where: { id: meta.warrantyClaimId, companyId } });
      if (!claim) throw new NotFoundException("Warranty claim not found");
    }
    if (meta.subcontractorDocumentId) {
      const doc = await this.prisma.subcontractorDocument.findFirst({ where: { id: meta.subcontractorDocumentId, companyId } });
      if (!doc) throw new NotFoundException("Subcontractor document not found");
    }
    if (meta.deficiencyId) {
      const deficiency = await this.prisma.deficiency.findFirst({ where: { id: meta.deficiencyId, companyId } });
      if (!deficiency) throw new NotFoundException("Deficiency not found");
    }
    const category: DocumentCategory = meta.category ? documentCategorySchema.parse(meta.category) : "other";

    const stored = await this.storage.save(companyId, file.originalname, file.buffer);

    return this.prisma.document.create({
      data: {
        companyId,
        projectId: meta.projectId,
        invoiceId: meta.invoiceId,
        punchListItemId: meta.punchListItemId,
        dailyLogId: meta.dailyLogId,
        incidentReportId: meta.incidentReportId,
        warrantyClaimId: meta.warrantyClaimId,
        subcontractorDocumentId: meta.subcontractorDocumentId,
        deficiencyId: meta.deficiencyId,
        name: file.originalname,
        storageKey: stored.storageKey,
        mimeType: file.mimetype,
        size: file.size,
        category,
        tags: meta.tags ?? [],
        uploadedByUserId,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  async updateTags(companyId: string, id: string, tags: string[]) {
    await this.findOrThrow(companyId, id);
    return this.prisma.document.update({
      where: { id },
      data: { tags },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  /** Uploads a new version of an existing document, chained via rootDocumentId. */
  async replace(
    companyId: string,
    id: string,
    uploadedByUserId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  ) {
    this.validateFile(file);
    const current = await this.findOrThrow(companyId, id);
    const rootId = current.rootDocumentId ?? current.id;

    const stored = await this.storage.save(companyId, file.originalname, file.buffer);

    return this.prisma.document.create({
      data: {
        companyId,
        projectId: current.projectId,
        invoiceId: current.invoiceId,
        punchListItemId: current.punchListItemId,
        dailyLogId: current.dailyLogId,
        incidentReportId: current.incidentReportId,
        warrantyClaimId: current.warrantyClaimId,
        subcontractorDocumentId: current.subcontractorDocumentId,
        deficiencyId: current.deficiencyId,
        name: file.originalname,
        storageKey: stored.storageKey,
        mimeType: file.mimetype,
        size: file.size,
        category: current.category,
        tags: current.tags,
        version: current.version + 1,
        rootDocumentId: rootId,
        uploadedByUserId,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  /** Full version chain for a document, newest first. */
  async versions(companyId: string, id: string) {
    const current = await this.findOrThrow(companyId, id);
    const rootId = current.rootDocumentId ?? current.id;
    return this.prisma.document.findMany({
      where: { companyId, OR: [{ id: rootId }, { rootDocumentId: rootId }] },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { version: "desc" },
    });
  }

  async delete(companyId: string, actor: AuditActor, id: string) {
    const doc = await this.findOrThrow(companyId, id);
    await this.prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
    this.audit.record(companyId, actor, "document.deleted", "Document", id, `Deleted document "${doc.name}"`);
    return { ok: true };
  }

  async download(companyId: string, id: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
    const doc = await this.prisma.document.findFirst({ where: { id, companyId } });
    if (!doc) throw new NotFoundException("Document not found");
    const buffer = await this.storage.read(doc.storageKey);
    return { buffer, name: doc.name, mimeType: doc.mimeType };
  }

  private async findOrThrow(companyId: string, id: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, companyId } });
    if (!doc) throw new NotFoundException("Document not found");
    return doc;
  }

  private validateFile(file: { mimetype: string; size: number }) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException("File exceeds the 25MB limit");
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`File type "${file.mimetype}" is not allowed`);
    }
  }
}
