import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CertifiedPayrollLine, SignCertifiedPayrollInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Federal FLSA/Davis-Bacon weekly overtime threshold — not the daily-8hr rule some states use. */
const WEEKLY_OVERTIME_THRESHOLD_HOURS = 40;

@Injectable()
export class CertifiedPayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string, projectId: string) {
    return this.prisma.certifiedPayrollReport.findMany({ where: { companyId, projectId }, orderBy: { weekEndingDate: "desc" } });
  }

  async get(companyId: string, id: string) {
    return this.findOrThrow(companyId, id);
  }

  /** Computes a week's payroll lines from TimeEntry without persisting anything — used both for a
   * pre-generation preview and internally by generate(). Regular/overtime hours are split per
   * worker on this project's hours alone (not the worker's total hours across every project that
   * week) — a documented simplification, see the module's implementation notes. */
  async computeWeek(companyId: string, projectId: string, weekEndingDate: Date) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const weekStart = new Date(weekEndingDate.getTime() - 6 * MS_PER_DAY);
    const entries = await this.prisma.timeEntry.findMany({
      where: { companyId, projectId, date: { gte: weekStart, lte: weekEndingDate } },
      include: { worker: { include: { wageClassification: true } } },
    });

    const byWorker = new Map<string, { worker: (typeof entries)[number]["worker"]; totalHours: number }>();
    for (const entry of entries) {
      const bucket = byWorker.get(entry.workerId) ?? { worker: entry.worker, totalHours: 0 };
      bucket.totalHours += Number(entry.hours);
      byWorker.set(entry.workerId, bucket);
    }

    const lines: CertifiedPayrollLine[] = Array.from(byWorker.values())
      .map(({ worker, totalHours }) => {
        const regularHours = Math.min(totalHours, WEEKLY_OVERTIME_THRESHOLD_HOURS);
        const overtimeHours = Math.max(0, totalHours - WEEKLY_OVERTIME_THRESHOLD_HOURS);
        const ratePerHour = worker.hourlyCost !== null ? Number(worker.hourlyCost) : null;
        const fringeRate = worker.wageClassification ? Number(worker.wageClassification.fringeRate) : 0;
        const grossPay = ratePerHour !== null ? regularHours * ratePerHour + overtimeHours * ratePerHour * 1.5 + fringeRate * totalHours : null;
        const belowPrevailingRate = worker.wageClassification !== null && ratePerHour !== null && ratePerHour < Number(worker.wageClassification.hourlyRate);
        return {
          workerId: worker.id,
          workerName: worker.name,
          trade: worker.wageClassification?.trade ?? null,
          regularHours,
          overtimeHours,
          ratePerHour,
          fringeRate,
          grossPay,
          belowPrevailingRate,
        };
      })
      .sort((a, b) => a.workerName.localeCompare(b.workerName));

    const totalGrossPay = lines.reduce((sum, line) => sum + (line.grossPay ?? 0), 0);
    return { project, weekStart, weekEndingDate, lines, totalGrossPay };
  }

  async generate(companyId: string, actor: AuditActor, projectId: string, weekEndingDateRaw: string) {
    const weekEndingDate = new Date(weekEndingDateRaw);
    if (Number.isNaN(weekEndingDate.getTime())) throw new BadRequestException("Invalid weekEndingDate");

    const { lines, totalGrossPay } = await this.computeWeek(companyId, projectId, weekEndingDate);

    const existing = await this.prisma.certifiedPayrollReport.findUnique({
      where: { projectId_weekEndingDate: { projectId, weekEndingDate } },
    });
    const payrollNumber =
      existing?.payrollNumber ?? (await this.prisma.certifiedPayrollReport.count({ where: { projectId } })) + 1;

    const report = await this.prisma.certifiedPayrollReport.upsert({
      where: { projectId_weekEndingDate: { projectId, weekEndingDate } },
      create: {
        companyId,
        projectId,
        weekEndingDate,
        payrollNumber,
        lineItems: lines as unknown as object,
        totalGrossPay,
        createdByUserId: actor.userId,
      },
      update: { lineItems: lines as unknown as object, totalGrossPay },
    });

    this.audit.record(
      companyId,
      actor,
      "certified_payroll.generated",
      "CertifiedPayrollReport",
      report.id,
      `Generated certified payroll #${payrollNumber} for week ending ${weekEndingDate.toISOString().slice(0, 10)}`,
    );
    return report;
  }

  async markNoWorkPerformed(companyId: string, actor: AuditActor, projectId: string, weekEndingDateRaw: string) {
    const weekEndingDate = new Date(weekEndingDateRaw);
    if (Number.isNaN(weekEndingDate.getTime())) throw new BadRequestException("Invalid weekEndingDate");
    await this.prisma.project.findFirstOrThrow({ where: { id: projectId, companyId } }).catch(() => {
      throw new NotFoundException("Project not found");
    });

    const existing = await this.prisma.certifiedPayrollReport.findUnique({
      where: { projectId_weekEndingDate: { projectId, weekEndingDate } },
    });
    const payrollNumber =
      existing?.payrollNumber ?? (await this.prisma.certifiedPayrollReport.count({ where: { projectId } })) + 1;

    const report = await this.prisma.certifiedPayrollReport.upsert({
      where: { projectId_weekEndingDate: { projectId, weekEndingDate } },
      create: { companyId, projectId, weekEndingDate, payrollNumber, noWorkPerformed: true, lineItems: [], totalGrossPay: 0, createdByUserId: actor.userId },
      update: { noWorkPerformed: true, lineItems: [], totalGrossPay: 0 },
    });

    this.audit.record(
      companyId,
      actor,
      "certified_payroll.generated",
      "CertifiedPayrollReport",
      report.id,
      `Filed "no work performed" for week ending ${weekEndingDate.toISOString().slice(0, 10)}`,
    );
    return report;
  }

  async sign(companyId: string, actor: AuditActor, id: string, input: SignCertifiedPayrollInput) {
    const report = await this.findOrThrow(companyId, id);
    const updated = await this.prisma.certifiedPayrollReport.update({
      where: { id: report.id },
      data: { statementSignerName: input.signerName, statementSignedAt: new Date() },
    });
    this.audit.record(
      companyId,
      actor,
      "certified_payroll.signed",
      "CertifiedPayrollReport",
      report.id,
      `Signed the statement of compliance for certified payroll #${report.payrollNumber}`,
    );
    return updated;
  }

  async pdf(companyId: string, id: string): Promise<Buffer> {
    const report = await this.findOrThrow(companyId, id);
    const [company, project] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      this.prisma.project.findUniqueOrThrow({ where: { id: report.projectId } }),
    ]);
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey).catch(() => undefined) : undefined;
    const lines = (report.lineItems as unknown as CertifiedPayrollLine[] | null) ?? [];

    return this.pdfService.render({
      title: "Statement of Compliance — Certified Payroll",
      subtitle: `${company.name} — Payroll No. ${report.payrollNumber} — Week ending ${report.weekEndingDate.toISOString().slice(0, 10)}`,
      meta: [
        { label: "Contractor", value: company.name },
        { label: "Contractor address", value: company.address ?? "—" },
        { label: "Project", value: project.name },
        { label: "Project address", value: project.address ?? "—" },
        { label: "Contract No.", value: project.contractNumber ?? "—" },
      ],
      tableHeader: ["Employee", "Classification", "Reg. Hrs", "OT Hrs", "Rate", "Fringe", "Gross Pay"],
      tableRows: report.noWorkPerformed
        ? [{ cells: ["NO WORK PERFORMED THIS WEEK", "", "", "", "", "", ""] }]
        : lines.map((line) => ({
            cells: [
              line.workerName,
              line.trade ?? "Unclassified",
              line.regularHours.toFixed(2),
              line.overtimeHours.toFixed(2),
              line.ratePerHour !== null ? line.ratePerHour.toFixed(2) : "—",
              line.fringeRate.toFixed(2),
              line.grossPay !== null ? line.grossPay.toFixed(2) : "—",
            ],
          })),
      totals: [{ label: "Total gross pay", value: Number(report.totalGrossPay ?? 0).toFixed(2), emphasize: true }],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
      signature: report.statementSignedAt
        ? { signerName: report.statementSignerName ?? "", signedAt: report.statementSignedAt }
        : undefined,
    });
  }

  private async findOrThrow(companyId: string, id: string) {
    const report = await this.prisma.certifiedPayrollReport.findFirst({ where: { id, companyId } });
    if (!report) throw new NotFoundException("Certified payroll report not found");
    return report;
  }
}
