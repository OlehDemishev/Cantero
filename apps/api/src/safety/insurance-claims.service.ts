import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateInsuranceClaimInput, UpdateInsuranceClaimInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { OutboxService } from "../common/webhooks/outbox.service";
import { toCsv } from "../common/csv";

@Injectable()
export class InsuranceClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  list(companyId: string, projectId?: string) {
    return this.prisma.insuranceClaim.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}) },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { dateFiled: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const claim = await this.prisma.insuranceClaim.findFirst({
      where: { id, companyId },
      include: { project: { select: { id: true, name: true } } },
    });
    if (!claim) throw new NotFoundException("Insurance claim not found");
    return claim;
  }

  async create(companyId: string, actor: AuditActor, input: CreateInsuranceClaimInput) {
    if (input.projectId) await this.assertProject(companyId, input.projectId);
    if (input.incidentReportId) {
      const incident = await this.prisma.incidentReport.findFirst({ where: { id: input.incidentReportId, companyId } });
      if (!incident) throw new NotFoundException("Incident report not found");
    }

    const claim = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.insuranceClaim.create({
        data: {
          companyId,
          projectId: input.projectId,
          incidentReportId: input.incidentReportId,
          claimType: input.claimType,
          claimNumber: input.claimNumber,
          insurerName: input.insurerName,
          policyNumber: input.policyNumber,
          dateFiled: new Date(input.dateFiled),
          description: input.description,
          adjusterName: input.adjusterName,
          adjusterContact: input.adjusterContact,
          claimAmount: input.claimAmount,
          createdByUserId: actor.userId,
          createdByName: actor.name,
        },
        include: { project: { select: { id: true, name: true } } },
      });
      await this.outbox.enqueue(tx, companyId, "insurance_claim.filed", { claimId: claim.id, claimType: claim.claimType, projectId: input.projectId });
      return claim;
    });
    this.audit.record(
      companyId,
      actor,
      "insurance_claim.filed",
      "InsuranceClaim",
      claim.id,
      `Filed a ${input.claimType.replace(/_/g, " ")} claim with ${input.insurerName}`,
    );
    return claim;
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdateInsuranceClaimInput) {
    const claim = await this.get(companyId, id);
    const statusChanged = !!input.status && input.status !== claim.status;
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.insuranceClaim.update({
        where: { id: claim.id },
        data: {
          status: input.status,
          claimNumber: input.claimNumber,
          insurerName: input.insurerName,
          policyNumber: input.policyNumber,
          description: input.description,
          adjusterName: input.adjusterName,
          adjusterContact: input.adjusterContact,
          claimAmount: input.claimAmount,
          settledAmount: input.settledAmount,
          settledAt: input.settledAt === undefined ? undefined : input.settledAt ? new Date(input.settledAt) : null,
          notes: input.notes,
        },
        include: { project: { select: { id: true, name: true } } },
      });
      if (statusChanged) await this.outbox.enqueue(tx, companyId, "insurance_claim.status_changed", { claimId: claim.id, status: input.status });
      return updated;
    });
    if (statusChanged) {
      this.audit.record(
        companyId,
        actor,
        "insurance_claim.status_changed",
        "InsuranceClaim",
        claim.id,
        `Insurance claim moved to "${input.status!.replace(/_/g, " ")}"`,
      );
    }
    return updated;
  }

  /** One row per claim — a familiar starting layout for a broker/CFO reconciling filed claims, not an official insurer export format. */
  async exportCsv(companyId: string): Promise<string> {
    const claims = await this.prisma.insuranceClaim.findMany({
      where: { companyId },
      include: { project: { select: { name: true } } },
      orderBy: { dateFiled: "asc" },
    });

    return toCsv(
      ["Date filed", "Type", "Status", "Project", "Insurer", "Claim number", "Policy number", "Claim amount", "Settled amount", "Description"],
      claims.map((c) => [
        c.dateFiled.toISOString().slice(0, 10),
        c.claimType.replace(/_/g, " "),
        c.status.replace(/_/g, " "),
        c.project?.name ?? "",
        c.insurerName,
        c.claimNumber ?? "",
        c.policyNumber ?? "",
        c.claimAmount?.toString() ?? "",
        c.settledAmount?.toString() ?? "",
        c.description,
      ]),
    );
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
