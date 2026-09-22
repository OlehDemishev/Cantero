import { Injectable } from "@nestjs/common";
import { OSHA_CASE_TYPES, type OshaCaseType } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { buildMonthlyNearMissTrend, calculateNearMissRatio } from "./near-miss-trend";
import { ProjectAccessService, type ProjectViewer } from "../common/project-access/project-access.service";

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
    private readonly projectAccess: ProjectAccessService,
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
  async safetyScorecard(companyId: string, year: number, viewer: ProjectViewer = {}) {
    const { start, end } = yearRange(year);
    // Every figure, the company-wide rate included, covers the same visible projects.
    const [visibleIncidents, visibleHours] = await Promise.all([
      this.projectAccess.visibleWhere(companyId, "IncidentReport", viewer.userId, viewer.role),
      this.projectAccess.visibleWhere(companyId, "TimeEntry", viewer.userId, viewer.role),
    ]);
    const [incidents, hoursByProject, totalHoursResult] = await Promise.all([
      this.prisma.incidentReport.findMany({
        where: { AND: [{ companyId, occurredAt: { gte: start, lt: end } }, visibleIncidents] },
        include: { project: { select: { id: true, name: true } } },
      }),
      this.prisma.timeEntry.groupBy({ by: ["projectId"], where: { AND: [{ companyId, date: { gte: start, lt: end } }, visibleHours] }, _sum: { hours: true } }),
      this.prisma.timeEntry.aggregate({ where: { AND: [{ companyId, date: { gte: start, lt: end } }, visibleHours] }, _sum: { hours: true } }),
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

  /**
   * The leading-indicator counterpart to safetyScorecard's lagging TRIR: near-misses reported
   * against actual recordable cases, company-wide and per project. See near-miss-trend.ts for why
   * a *higher* ratio is the healthy direction here (Heinrich's triangle) and why zero recordable
   * cases yields a null ratio rather than a misleading number.
   */
  async nearMissAnalytics(companyId: string, year: number, viewer: ProjectViewer = {}) {
    const visible = await this.projectAccess.visibleWhere(companyId, "IncidentReport", viewer.userId, viewer.role);
    const { start, end } = yearRange(year);
    const incidents = await this.prisma.incidentReport.findMany({
      where: { AND: [{ companyId, occurredAt: { gte: start, lt: end } }, visible] },
      include: { project: { select: { id: true, name: true } } },
    });

    const totalNearMiss = incidents.filter((i) => i.severity === "near_miss").length;
    const totalRecordable = incidents.filter((i) => i.oshaRecordable).length;

    const byProject = new Map<string, { projectName: string; nearMissCount: number; recordableCount: number }>();
    for (const inc of incidents) {
      const bucket = byProject.get(inc.projectId) ?? { projectName: inc.project.name, nearMissCount: 0, recordableCount: 0 };
      if (inc.severity === "near_miss") bucket.nearMissCount++;
      if (inc.oshaRecordable) bucket.recordableCount++;
      byProject.set(inc.projectId, bucket);
    }

    return {
      year,
      totalNearMiss,
      totalRecordable,
      ratio: calculateNearMissRatio(totalNearMiss, totalRecordable),
      monthlyTrend: buildMonthlyNearMissTrend(
        incidents.map((i) => ({ occurredAt: i.occurredAt, isNearMiss: i.severity === "near_miss", oshaRecordable: i.oshaRecordable })),
      ),
      projects: Array.from(byProject.entries()).map(([projectId, b]) => ({
        projectId,
        projectName: b.projectName,
        nearMissCount: b.nearMissCount,
        recordableCount: b.recordableCount,
        ratio: calculateNearMissRatio(b.nearMissCount, b.recordableCount),
      })),
    };
  }

  /**
   * Neither JobHazardAnalysis nor SafetyBriefing has a "required roster" — attendance/
   * acknowledgment rows only exist for workers who actually showed up or signed. So "completion
   * rate" here means something specific and useful: of the company's currently active workers,
   * what fraction have been reached by EITHER a JHA acknowledgment or a briefing attendance
   * within the lookback window — and, for the rest, how long it's actually been (or "never").
   */
  async trainingCompliance(companyId: string, lookbackDays = 90) {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const [activeWorkers, jhaAcks, briefingAttendance] = await Promise.all([
      this.prisma.worker.findMany({ where: { companyId, active: true }, select: { id: true, name: true } }),
      this.prisma.jhaAcknowledgment.findMany({
        where: { worker: { companyId } },
        select: { workerId: true, signedAt: true },
        orderBy: { signedAt: "desc" },
      }),
      this.prisma.safetyBriefingAttendance.findMany({
        where: { worker: { companyId } },
        select: { workerId: true, briefing: { select: { date: true } } },
      }),
    ]);

    const lastTrainingByWorker = new Map<string, Date>();
    for (const ack of jhaAcks) {
      const existing = lastTrainingByWorker.get(ack.workerId);
      if (!existing || ack.signedAt > existing) lastTrainingByWorker.set(ack.workerId, ack.signedAt);
    }
    for (const attendance of briefingAttendance) {
      const existing = lastTrainingByWorker.get(attendance.workerId);
      if (!existing || attendance.briefing.date > existing) lastTrainingByWorker.set(attendance.workerId, attendance.briefing.date);
    }

    const workers = activeWorkers.map((w) => {
      const lastTrainingAt = lastTrainingByWorker.get(w.id) ?? null;
      return {
        workerId: w.id,
        workerName: w.name,
        lastTrainingAt,
        overdue: !lastTrainingAt || lastTrainingAt < cutoff,
      };
    });
    const overdueWorkers = workers.filter((w) => w.overdue).sort((a, b) => (a.lastTrainingAt?.getTime() ?? 0) - (b.lastTrainingAt?.getTime() ?? 0));

    return {
      lookbackDays,
      totalActiveWorkers: activeWorkers.length,
      compliantCount: workers.length - overdueWorkers.length,
      completionRate: activeWorkers.length > 0 ? round2(((workers.length - overdueWorkers.length) / activeWorkers.length) * 100) : null,
      overdueWorkers,
    };
  }
}
