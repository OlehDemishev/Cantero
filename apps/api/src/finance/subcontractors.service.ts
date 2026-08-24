import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AddSubcontractorDocumentInput, CreateSubcontractorInput, SubcontractorDocumentType } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

/// The two documents virtually every jurisdiction requires on file before a sub can legally work
/// on a job site — assign() blocks on these, complianceStatus() reports on them individually.
const REQUIRED_DOCUMENT_TYPES: SubcontractorDocumentType[] = ["general_liability_insurance", "workers_comp_insurance"];

@Injectable()
export class SubcontractorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.subcontractor.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  create(companyId: string, input: CreateSubcontractorInput) {
    return this.prisma.subcontractor.create({ data: { ...input, companyId } });
  }

  listAssignments(companyId: string, subcontractorId: string) {
    return this.prisma.subcontractorAssignment.findMany({
      where: { subcontractorId, subcontractor: { companyId } },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async assign(companyId: string, subcontractorId: string, projectId: string) {
    const subcontractor = await this.prisma.subcontractor.findFirst({ where: { id: subcontractorId, companyId } });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    await this.assertCompliant(companyId, subcontractorId, subcontractor.name);

    return this.prisma.subcontractorAssignment.upsert({
      where: { subcontractorId_projectId: { subcontractorId, projectId } },
      create: { subcontractorId, projectId },
      update: {},
      include: { project: { select: { name: true } } },
    });
  }

  async unassign(companyId: string, subcontractorId: string, assignmentId: string) {
    const assignment = await this.prisma.subcontractorAssignment.findFirst({
      where: { id: assignmentId, subcontractorId, subcontractor: { companyId } },
    });
    if (!assignment) throw new NotFoundException("Assignment not found");
    await this.prisma.subcontractorAssignment.delete({ where: { id: assignmentId } });
    return { ok: true };
  }

  listDocuments(companyId: string, subcontractorId: string) {
    return this.prisma.subcontractorDocument.findMany({
      where: { companyId, subcontractorId },
      orderBy: { expiresAt: "asc" },
    });
  }

  async addDocument(companyId: string, actor: AuditActor, subcontractorId: string, input: AddSubcontractorDocumentInput) {
    const subcontractor = await this.prisma.subcontractor.findFirst({ where: { id: subcontractorId, companyId } });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");

    const doc = await this.prisma.subcontractorDocument.create({
      data: { companyId, subcontractorId, type: input.type, name: input.name, expiresAt: new Date(input.expiresAt) },
    });
    this.audit.record(
      companyId,
      actor,
      "subcontractor_document.added",
      "SubcontractorDocument",
      doc.id,
      `Added ${input.type.replace(/_/g, " ")} for "${subcontractor.name}", expires ${doc.expiresAt.toLocaleDateString()}`,
    );
    return doc;
  }

  async deleteDocument(companyId: string, subcontractorId: string, documentId: string) {
    const doc = await this.prisma.subcontractorDocument.findFirst({ where: { id: documentId, subcontractorId, companyId } });
    if (!doc) throw new NotFoundException("Document not found");
    await this.prisma.subcontractorDocument.delete({ where: { id: documentId } });
    return { ok: true };
  }

  /** Per-requirement breakdown (missing/expired/valid) — lets the UI show compliance status
   * inline without waiting for an assign() call to fail. */
  async complianceStatus(companyId: string, subcontractorId: string) {
    const subcontractor = await this.prisma.subcontractor.findFirst({ where: { id: subcontractorId, companyId } });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");

    const now = new Date();
    const docs = await this.prisma.subcontractorDocument.findMany({
      where: { companyId, subcontractorId, type: { in: REQUIRED_DOCUMENT_TYPES } },
      orderBy: { expiresAt: "desc" },
    });

    const requirements = REQUIRED_DOCUMENT_TYPES.map((type) => {
      const current = docs.find((d) => d.type === type && d.expiresAt.getTime() > now.getTime());
      const latest = current ?? docs.find((d) => d.type === type);
      return {
        type,
        status: (!latest ? "missing" : current ? "valid" : "expired") as "missing" | "expired" | "valid",
        expiresAt: latest?.expiresAt.toISOString() ?? null,
      };
    });

    return { compliant: requirements.every((r) => r.status === "valid"), requirements };
  }

  private async assertCompliant(companyId: string, subcontractorId: string, subcontractorName: string) {
    const now = new Date();
    const validDocs = await this.prisma.subcontractorDocument.findMany({
      where: { companyId, subcontractorId, type: { in: REQUIRED_DOCUMENT_TYPES }, expiresAt: { gt: now } },
    });
    const validTypes = new Set(validDocs.map((d) => d.type));
    const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !validTypes.has(t));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Cannot assign "${subcontractorName}" — missing or expired: ${missing.map((t) => t.replace(/_/g, " ")).join(", ")}`,
      );
    }
  }
}
