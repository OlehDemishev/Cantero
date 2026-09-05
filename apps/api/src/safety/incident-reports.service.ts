import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateIncidentReportInput, UpdateIncidentReportInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { toCsv } from "../common/csv";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";

@Injectable()
export class IncidentReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
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

  /** A narrative-style incident report handout — free-form body rather than a line-item table, since a single incident's description/corrective-actions read better as prose than as table cells. */
  async generatePdf(companyId: string, id: string): Promise<Buffer> {
    const report = await this.prisma.incidentReport.findFirst({ where: { id, companyId }, include: { project: { select: { name: true } } } });
    if (!report) throw new NotFoundException("Incident report not found");
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey).catch(() => undefined) : undefined;

    const bodyParts = [
      `Description:\n${report.description}`,
      report.location ? `Location: ${report.location}` : null,
      report.involvedPersons ? `Involved persons:\n${report.involvedPersons}` : null,
      report.correctiveActions ? `Corrective actions:\n${report.correctiveActions}` : null,
    ].filter((p): p is string => p !== null);

    return this.pdf.renderTextDocument({
      title: `Incident report — ${report.project.name}`,
      subtitle: report.severity.replace(/_/g, " "),
      meta: [
        { label: "Date", value: report.occurredAt.toISOString().slice(0, 10) },
        { label: "OSHA recordable", value: report.oshaRecordable ? "Yes" : "No" },
        { label: "Reported by", value: report.reportedByName },
      ],
      body: bodyParts.join("\n\n"),
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    });
  }
}
