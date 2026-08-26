import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateIncidentReportInput, UpdateIncidentReportInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { toCsv } from "../common/csv";

@Injectable()
export class IncidentReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.incidentReport.findMany({ where: { projectId }, orderBy: { occurredAt: "desc" } });
  }

  async get(companyId: string, id: string) {
    const report = await this.prisma.incidentReport.findFirst({ where: { id, companyId } });
    if (!report) throw new NotFoundException("Incident report not found");
    return report;
  }

  async create(companyId: string, actor: AuditActor, input: CreateIncidentReportInput) {
    const project = await this.assertProject(companyId, input.projectId);

    const report = await this.prisma.incidentReport.create({
      data: {
        companyId,
        projectId: input.projectId,
        occurredAt: new Date(input.occurredAt),
        severity: input.severity,
        description: input.description,
        location: input.location,
        involvedPersons: input.involvedPersons,
        correctiveActions: input.correctiveActions,
        oshaRecordable: input.oshaRecordable,
        oshaCaseType: input.oshaCaseType,
        daysAwayFromWork: input.daysAwayFromWork,
        daysJobTransferOrRestriction: input.daysJobTransferOrRestriction,
        reportedByUserId: actor.userId,
        reportedByName: actor.name,
      },
    });
    this.audit.record(
      companyId,
      actor,
      "incident_report.created",
      "IncidentReport",
      report.id,
      `Logged ${input.severity.replace(/_/g, " ")} incident on "${project.name}"`,
    );
    this.webhooks.trigger(companyId, "safety_incident.logged", { incidentId: report.id, severity: report.severity, projectId: input.projectId });
    return report;
  }

  async update(companyId: string, id: string, input: UpdateIncidentReportInput) {
    const report = await this.get(companyId, id);
    return this.prisma.incidentReport.update({
      where: { id: report.id },
      data: {
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
        severity: input.severity,
        description: input.description,
        location: input.location,
        involvedPersons: input.involvedPersons,
        correctiveActions: input.correctiveActions,
        oshaRecordable: input.oshaRecordable,
        oshaCaseType: input.oshaCaseType,
        daysAwayFromWork: input.daysAwayFromWork,
        daysJobTransferOrRestriction: input.daysJobTransferOrRestriction,
      },
    });
  }

  /** Columns mirror the shape of an OSHA 300 log (case, date, location, description,
   * classification) closely enough to hand to a safety officer for their own filing — this is
   * not an official OSHA-compliant export, just a familiar starting layout. */
  async exportCsv(companyId: string): Promise<string> {
    const reports = await this.prisma.incidentReport.findMany({
      where: { companyId },
      include: { project: { select: { name: true } } },
      orderBy: { occurredAt: "asc" },
    });

    return toCsv(
      [
        "Case No.",
        "Date",
        "Project",
        "Location",
        "Classification",
        "Description",
        "Involved Persons",
        "Corrective Actions",
        "OSHA Recordable",
        "OSHA Case Type",
        "Days Away From Work",
        "Days Job Transfer/Restriction",
        "Reported By",
      ],
      reports.map((r, i) => [
        String(i + 1),
        r.occurredAt.toISOString().slice(0, 10),
        r.project.name,
        r.location ?? "",
        r.severity.replace(/_/g, " "),
        r.description,
        r.involvedPersons ?? "",
        r.correctiveActions ?? "",
        r.oshaRecordable ? "Yes" : "No",
        r.oshaCaseType?.replace(/_/g, " ") ?? "",
        r.daysAwayFromWork?.toString() ?? "",
        r.daysJobTransferOrRestriction?.toString() ?? "",
        r.reportedByName,
      ]),
    );
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
