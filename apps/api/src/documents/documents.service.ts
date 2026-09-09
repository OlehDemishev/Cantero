import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { DocumentCategory, Locale } from "@cantero/shared";
import { documentCategorySchema } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — contracts/photos, not video
const DOCUMENTS_QUERY_CAP = 2000;
const DELETED_DOCUMENTS_PAGE_SIZE = 100;

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
  permitId?: string;
  safetyBriefingId?: string;
  supplierDocumentId?: string;
  companyDocumentId?: string;
  insuranceClaimId?: string;
  rfiId?: string;
  safetyDataSheetId?: string;
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
  permitId?: string;
  safetyBriefingId?: string;
  supplierDocumentId?: string;
  companyDocumentId?: string;
  insuranceClaimId?: string;
  rfiId?: string;
  safetyDataSheetId?: string;
  /** Only meaningful alongside safetyBriefingId today — which language this file's content is in. */
  locale?: Locale;
  category?: string;
  tags?: string[];
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  /** Latest version per chain, excluding soft-deleted documents. `userId`/`role` narrow the
   * result to documents whose project (if any) the caller may actually see — covers every filter
   * combination (by rfiId, punchListItemId, ...), not just an explicit projectId filter, since a
   * document attached to e.g. a restricted project's RFI is just as off-limits.
   *
   * Bounded at DOCUMENTS_QUERY_CAP rather than proper cursor pagination (unlike most other list
   * endpoints in this app): the version-chain grouping and the project-access post-filter below
   * both happen in memory, after the fetch — cursor-paginating the raw query could split a
   * chain's versions across pages, or return a short page purely because access-filtering
   * removed rows, not because there were no more. A DB-level fix needs the grouping done in SQL
   * (e.g. DISTINCT ON), which is a larger change; the cap only closes the "truly unbounded"
   * failure mode the audit flagged. */
  async list(companyId: string, filter: DocumentListFilter, userId?: string, role?: string) {
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
        ...(filter.permitId ? { permitId: filter.permitId } : {}),
        ...(filter.safetyBriefingId ? { safetyBriefingId: filter.safetyBriefingId } : {}),
        ...(filter.supplierDocumentId ? { supplierDocumentId: filter.supplierDocumentId } : {}),
        ...(filter.companyDocumentId ? { companyDocumentId: filter.companyDocumentId } : {}),
        ...(filter.insuranceClaimId ? { insuranceClaimId: filter.insuranceClaimId } : {}),
        ...(filter.rfiId ? { rfiId: filter.rfiId } : {}),
        ...(filter.safetyDataSheetId ? { safetyDataSheetId: filter.safetyDataSheetId } : {}),
        ...(category ? { category } : {}),
        ...(filter.tag ? { tags: { has: filter.tag } } : {}),
        ...(filter.search ? { name: { contains: filter.search, mode: "insensitive" as const } } : {}),
      },
      include: { uploadedBy: { select: { id: true, name: true } }, project: true },
      orderBy: { createdAt: "desc" },
      take: DOCUMENTS_QUERY_CAP,
    });

    const latestByChain = new Map<string, (typeof docs)[number]>();
    for (const doc of docs) {
      const chainKey = doc.rootDocumentId ?? doc.id;
      const existing = latestByChain.get(chainKey);
      if (!existing || doc.version > existing.version) latestByChain.set(chainKey, doc);
    }

    const result = Array.from(latestByChain.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return this.filterByProjectAccess(result, userId, role);
  }

  private async filterByProjectAccess<T extends { projectId: string | null }>(
    docs: T[],
    userId?: string,
    role?: string,
  ): Promise<T[]> {
    if (!userId || !role || role === "owner" || role === "admin") return docs;

    const projectIds = [...new Set(docs.map((d) => d.projectId).filter((id): id is string => !!id))];
    if (projectIds.length === 0) return docs;

    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, restrictedToMembers: true },
    });
    const accessible = await this.projectAccess.filterAccessible(projects, userId, role);
    const accessibleIds = new Set(accessible.map((p) => p.id));
    return docs.filter((d) => !d.projectId || accessibleIds.has(d.projectId));
  }

  /** Soft-deleted documents, most recently deleted first — lets an owner/admin undo a delete
   * instead of it being silent and (from the UI's point of view) permanent. */
  async listDeleted(companyId: string, take: number = DELETED_DOCUMENTS_PAGE_SIZE, cursor?: string) {
    return this.prisma.document.findMany({
      where: { companyId, deletedAt: { not: null } },
      include: { uploadedBy: { select: { id: true, name: true } }, project: true },
      // deletedAt is a server-set timestamp but not guaranteed unique to the millisecond under
      // a bulk delete — an id tiebreaker keeps the sort (and cursor pagination) deterministic.
      orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }

  async restore(companyId: string, actor: AuditActor, id: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, companyId, deletedAt: { not: null } } });
    if (!doc) throw new NotFoundException("Deleted document not found");
    await this.prisma.document.update({ where: { id }, data: { deletedAt: null } });
    this.audit.record(companyId, actor, "document.restored", "Document", id, `Restored document "${doc.name}"`);
    return { ok: true };
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
    if (meta.permitId) {
      const permit = await this.prisma.permit.findFirst({ where: { id: meta.permitId, companyId } });
      if (!permit) throw new NotFoundException("Permit not found");
    }
    if (meta.safetyBriefingId) {
      const briefing = await this.prisma.safetyBriefing.findFirst({ where: { id: meta.safetyBriefingId, companyId } });
      if (!briefing) throw new NotFoundException("Safety briefing not found");
    }
    if (meta.supplierDocumentId) {
      const doc = await this.prisma.supplierDocument.findFirst({ where: { id: meta.supplierDocumentId, companyId } });
      if (!doc) throw new NotFoundException("Supplier document not found");
    }
    if (meta.companyDocumentId) {
      const doc = await this.prisma.companyDocument.findFirst({ where: { id: meta.companyDocumentId, companyId } });
      if (!doc) throw new NotFoundException("Company document not found");
    }
    if (meta.insuranceClaimId) {
      const claim = await this.prisma.insuranceClaim.findFirst({ where: { id: meta.insuranceClaimId, companyId } });
      if (!claim) throw new NotFoundException("Insurance claim not found");
    }
    if (meta.rfiId) {
      const rfi = await this.prisma.rfi.findFirst({ where: { id: meta.rfiId, companyId } });
      if (!rfi) throw new NotFoundException("RFI not found");
    }
    if (meta.safetyDataSheetId) {
      const sds = await this.prisma.safetyDataSheet.findFirst({ where: { id: meta.safetyDataSheetId, companyId } });
      if (!sds) throw new NotFoundException("Safety data sheet not found");
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
        permitId: meta.permitId,
        safetyBriefingId: meta.safetyBriefingId,
        supplierDocumentId: meta.supplierDocumentId,
        companyDocumentId: meta.companyDocumentId,
        insuranceClaimId: meta.insuranceClaimId,
        rfiId: meta.rfiId,
        safetyDataSheetId: meta.safetyDataSheetId,
        locale: meta.locale,
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

  async updateTags(companyId: string, id: string, tags: string[], userId?: string, role?: string) {
    await this.findOrThrow(companyId, id, userId, role);
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
    userId?: string,
    role?: string,
  ) {
    this.validateFile(file);
    const current = await this.findOrThrow(companyId, id, userId, role);
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
        permitId: current.permitId,
        safetyBriefingId: current.safetyBriefingId,
        supplierDocumentId: current.supplierDocumentId,
        companyDocumentId: current.companyDocumentId,
        insuranceClaimId: current.insuranceClaimId,
        rfiId: current.rfiId,
        locale: current.locale,
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
  async versions(companyId: string, id: string, userId?: string, role?: string) {
    const current = await this.findOrThrow(companyId, id, userId, role);
    const rootId = current.rootDocumentId ?? current.id;
    return this.prisma.document.findMany({
      where: { companyId, OR: [{ id: rootId }, { rootDocumentId: rootId }] },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { version: "desc" },
    });
  }

  async delete(companyId: string, actor: AuditActor, id: string, userId?: string, role?: string) {
    const doc = await this.findOrThrow(companyId, id, userId, role);
    await this.prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
    this.audit.record(companyId, actor, "document.deleted", "Document", id, `Deleted document "${doc.name}"`);
    return { ok: true };
  }

  async download(companyId: string, id: string, userId?: string, role?: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
    const doc = await this.findOrThrow(companyId, id, userId, role);
    const buffer = await this.storage.read(doc.storageKey);
    return { buffer, name: doc.name, mimeType: doc.mimeType };
  }

  private async findOrThrow(companyId: string, id: string, userId?: string, role?: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, companyId } });
    if (!doc) throw new NotFoundException("Document not found");
    if (doc.projectId) await this.projectAccess.assertAccess(companyId, doc.projectId, userId, role);
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
