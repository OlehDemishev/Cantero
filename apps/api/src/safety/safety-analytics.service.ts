import { Injectable } from "@nestjs/common";
import { OSHA_CASE_TYPES, type OshaCaseType } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
/** Standard OSHA incidence-rate base: (recordable cases × 200,000 hours) / total hours worked —
 * 200,000 approximates 100 full-time workers' annual hours, the industry-standard normalization. */
const TRIR_BASE_HOURS = 200_000;

function yearRange(year: number): { start: Date; end: Date } {
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

@Injectable()
export class SafetyAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
  ) {}

  /**
   * The OSHA Form 300A summary shape: total recordable cases split into deaths / days-away-from-
   * work / job-transfer-or-restriction / other-recordable (columns G-J), total days lost (K-L),
   * and injury/illness type breakdown (M1-M6). A case is bucketed by the first category it
   * matches, deaths first, matching the form's own precedence (a fatal case isn't also counted
   * under days-away even if daysAwayFromWork happens to be set).
   */
  async osha300aSummary(companyId: string, year: number) {
    const { start, end } = yearRange(year);
    const incidents = await this.prisma.incidentReport.findMany({
      where: { companyId, oshaRecordable: true, occurredAt: { gte: start, lt: end } },
      include: { project: { select: { name: true } } },
      orderBy: { occurredAt: "asc" },
    });

    let deaths = 0;
    let daysAwayCases = 0;
    let jobTransferCases = 0;
    let otherRecordableCases = 0;
    let totalDaysAway = 0;
    let totalDaysJobTransfer = 0;
    const byCaseType = Object.fromEntries(OSHA_CASE_TYPES.map((t) => [t, 0])) as Record<OshaCaseType, number>;

    for (const inc of incidents) {
      if (inc.severity === "fatality") deaths++;
      else if ((inc.daysAwayFromWork ?? 0) > 0) daysAwayCases++;
      else if ((inc.daysJobTransferOrRestriction ?? 0) > 0) jobTransferCases++;
      else otherRecordableCases++;

      totalDaysAway += inc.daysAwayFromWork ?? 0;
      totalDaysJobTransfer += inc.daysJobTransferOrRestriction ?? 0;
      if (inc.oshaCaseType) byCaseType[inc.oshaCaseType]++;
    }

    return {
      year,
      totalRecordableCases: incidents.length,
      deaths,
      daysAwayCases,
      jobTransferCases,
      otherRecordableCases,
      totalDaysAway,
      totalDaysJobTransfer,
      byCaseType,
      cases: incidents.map((i) => ({
        id: i.id,
        occurredAt: i.occurredAt,
        projectName: i.project.name,
        description: i.description,
        oshaCaseType: i.oshaCaseType,
        daysAwayFromWork: i.daysAwayFromWork,
        daysJobTransferOrRestriction: i.daysJobTransferOrRestriction,
        isDeath: i.severity === "fatality",
      })),
    };
  }

  async osha300aPdf(companyId: string, year: number): Promise<Buffer> {
    const summary = await this.osha300aSummary(companyId, year);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey).catch(() => undefined) : undefined;

    const caseTypeLabels: Record<OshaCaseType, string> = {
      injury: "(M1) Injury",
      skin_disorder: "(M2) Skin disorder",
      respiratory_condition: "(M3) Respiratory condition",
      poisoning: "(M4) Poisoning",
      hearing_loss: "(M5) Hearing loss",
      all_other_illnesses: "(M6) All other illnesses",
    };

    return this.pdf.render({
      title: "OSHA Form 300A — Summary of Work-Related Injuries and Illnesses",
      subtitle: `${company.name} — Calendar Year ${year}`,
      meta: [
        { label: "Total recordable cases", value: String(summary.totalRecordableCases) },
        { label: "Establishment", value: company.name },
      ],
      tableHeader: ["Injury and Illness Type", "Number of Cases"],
      tableRows: OSHA_CASE_TYPES.map((type) => ({ cells: [caseTypeLabels[type], String(summary.byCaseType[type])] })),
      totals: [
        { label: "(G) Deaths", value: String(summary.deaths) },
        { label: "(H) Cases with days away from work", value: String(summary.daysAwayCases) },
        { label: "(I) Cases with job transfer or restriction", value: String(summary.jobTransferCases) },
        { label: "(J) Other recordable cases", value: String(summary.otherRecordableCases) },
        { label: "(K) Total days away from work", value: String(summary.totalDaysAway) },
        { label: "(L) Total days of job transfer or restriction", value: String(summary.totalDaysJobTransfer) },
        { label: "Total recordable cases", value: String(summary.totalRecordableCases), emphasize: true },
      ],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    });
  }

  /**
   * TRIR (Total Recordable Incident Rate) needs total hours worked to normalize against — sourced
   * from TimeEntry.hours, the same ledger labor cost reporting already relies on. A project or the
   * company total with zero logged hours returns trir: null (not 0), since a rate computed against
   * no denominator would misleadingly read as "perfectly safe" rather than "not measurable yet".
   */
  async safetyScorecard(companyId: string, year: number) {
    const { start, end } = yearRange(year);
    const [incidents, hoursByProject, totalHoursResult] = await Promise.all([
      this.prisma.incidentReport.findMany({
        where: { companyId, occurredAt: { gte: start, lt: end } },
        include: { project: { select: { id: true, name: true } } },
      }),
      this.prisma.timeEntry.groupBy({ by: ["projectId"], where: { companyId, date: { gte: start, lt: end } }, _sum: { hours: true } }),
      this.prisma.timeEntry.aggregate({ where: { companyId, date: { gte: start, lt: end } }, _sum: { hours: true } }),
    ]);

    const hoursByProjectId = new Map(hoursByProject.map((h) => [h.projectId, Number(h._sum.hours ?? 0)]));
    const projectIds = [...new Set([...incidents.map((i) => i.projectId), ...hoursByProjectId.keys()])];
    const projectRecords = await this.prisma.project.findMany({ where: { id: { in: projectIds }, companyId }, select: { id: true, name: true } });
    const projectNameById = new Map(projectRecords.map((p) => [p.id, p.name]));

    const projects = projectIds.map((projectId) => {
      const projectIncidents = incidents.filter((i) => i.projectId === projectId);
      const recordableCount = projectIncidents.filter((i) => i.oshaRecordable).length;
      const hours = hoursByProjectId.get(projectId) ?? 0;
      return {
        projectId,
        projectName: projectNameById.get(projectId) ?? null,
        totalIncidents: projectIncidents.length,
        recordableCount,
        hoursWorked: round2(hours),
        trir: hours > 0 ? round2((recordableCount * TRIR_BASE_HOURS) / hours) : null,
      };
    });
    projects.sort((a, b) => (b.trir ?? -1) - (a.trir ?? -1));

    const monthlyTrend = Array.from({ length: 12 }, (_, month) => {
      const count = incidents.filter((i) => i.occurredAt.getUTCMonth() === month).length;
      const recordable = incidents.filter((i) => i.occurredAt.getUTCMonth() === month && i.oshaRecordable).length;
      return { month: month + 1, totalIncidents: count, recordableCount: recordable };
    });

    const totalHours = Number(totalHoursResult._sum.hours ?? 0);
    const recordableCount = incidents.filter((i) => i.oshaRecordable).length;

    return {
      year,
      companyTrir: totalHours > 0 ? round2((recordableCount * TRIR_BASE_HOURS) / totalHours) : null,
      totalHours: round2(totalHours),
      totalIncidents: incidents.length,
      recordableCount,
      projects,
      monthlyTrend,
    };
  }
}
