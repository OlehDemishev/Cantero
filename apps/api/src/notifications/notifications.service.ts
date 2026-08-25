import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { WeatherService } from "../weather/weather.service";
import { BudgetService } from "../finance/budget.service";

export type Severity = "warning" | "critical";

export interface NotificationItem {
  key: string;
  type:
    | "low_stock"
    | "reminder_due"
    | "invoice_overdue"
    | "rfi_open"
    | "punch_list_open"
    | "submittal_pending"
    | "safety_incident"
    | "warranty_claim_open"
    | "mention"
    | "subcontractor_document_expiring"
    | "worker_certification_expiring"
    | "weather_risk"
    | "budget_overrun";
  severity: Severity;
  title: string;
  body: string;
  link: string;
  occurredAt: Date;
}

const REMINDER_LOOKAHEAD_DAYS = 3;
const DOCUMENT_EXPIRY_LOOKAHEAD_DAYS = 30;
const WEATHER_RISK_LOOKAHEAD_DAYS = 7;
/** A project at or above this fraction of its budgeted grand total (materials + labor +
 * subcontractor actuals combined) gets flagged — "at risk", not necessarily already over. */
const BUDGET_OVERRUN_THRESHOLD = 0.9;

/**
 * Notifications are fully derived from live data, not a persisted table —
 * each source is naturally self-clearing (restock resolves low-stock,
 * completing a reminder resolves it, paying an invoice resolves it), so
 * there is nothing to reconcile or expire. The only persisted state is
 * Membership.notificationsLastViewedAt, which drives the unread badge.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weather: WeatherService,
    private readonly budget: BudgetService,
  ) {}

  async list(companyId: string, userId: string) {
    const [
      lowStock,
      reminders,
      invoices,
      openRfis,
      openPunchItems,
      pendingSubmittals,
      incidents,
      openWarrantyClaims,
      mentions,
      expiringSubcontractorDocuments,
      expiringWorkerCertifications,
      weatherRisks,
      budgetOverruns,
      membership,
    ] = await Promise.all([
      this.lowStockItems(companyId),
      this.dueReminders(companyId),
      this.overdueInvoices(companyId),
      this.openRfis(companyId),
      this.openPunchListItems(companyId),
      this.pendingSubmittals(companyId),
      this.safetyIncidents(companyId),
      this.openWarrantyClaims(companyId),
      this.mentions(companyId, userId),
      this.expiringSubcontractorDocuments(companyId),
      this.expiringWorkerCertifications(companyId),
      this.weatherRiskTasks(companyId),
      this.budgetOverruns(companyId),
      this.prisma.membership.findFirst({ where: { companyId, userId } }),
    ]);

    const items = [
      ...lowStock,
      ...reminders,
      ...invoices,
      ...openRfis,
      ...openPunchItems,
      ...pendingSubmittals,
      ...incidents,
      ...openWarrantyClaims,
      ...mentions,
      ...expiringSubcontractorDocuments,
      ...expiringWorkerCertifications,
      ...weatherRisks,
      ...budgetOverruns,
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const lastViewedAt = membership?.notificationsLastViewedAt ?? null;
    const unreadCount = lastViewedAt
      ? items.filter((n) => n.occurredAt.getTime() > lastViewedAt.getTime()).length
      : items.length;

    const readRows = await this.prisma.notificationRead.findMany({
      where: { userId, notificationKey: { in: items.map((i) => i.key) } },
      select: { notificationKey: true },
    });
    const readKeys = new Set(readRows.map((r) => r.notificationKey));
    const notifications = items.map((i) => ({ ...i, read: readKeys.has(i.key) }));

    return { unreadCount, notifications };
  }

  async markSeen(companyId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({ where: { companyId, userId } });
    if (!membership) return { ok: false };
    await this.prisma.membership.update({
      where: { id: membership.id },
      data: { notificationsLastViewedAt: new Date() },
    });
    return { ok: true };
  }

  /** Individually dismissing/marking-read one derived item — upsert since the same key can be
   * marked read more than once (e.g. re-clicked) without erroring. */
  async markRead(companyId: string, userId: string, notificationKey: string) {
    await this.prisma.notificationRead.upsert({
      where: { userId_notificationKey: { userId, notificationKey } },
      create: { companyId, userId, notificationKey },
      update: {},
    });
    return { ok: true };
  }

  async markAllRead(companyId: string, userId: string, notificationKeys: string[]) {
    await this.prisma.notificationRead.createMany({
      data: notificationKeys.map((notificationKey) => ({ companyId, userId, notificationKey })),
      skipDuplicates: true,
    });
    return { ok: true };
  }

  private async lowStockItems(companyId: string): Promise<NotificationItem[]> {
    const materials = await this.prisma.materialCatalogItem.findMany({
      where: { companyId, reorderThreshold: { not: null } },
      include: {
        stockLevels: true,
        stockMovements: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return materials
      .filter((m) => {
        const onHand = m.stockLevels.reduce((sum, l) => sum + Number(l.quantityOnHand), 0);
        return onHand < Number(m.reorderThreshold);
      })
      .map((m) => {
        const onHand = m.stockLevels.reduce((sum, l) => sum + Number(l.quantityOnHand), 0);
        return {
          key: `low_stock:${m.id}`,
          type: "low_stock" as const,
          severity: (onHand <= 0 ? "critical" : "warning") as Severity,
          title: `${m.name} (${m.code}) is low on stock`,
          body: `${onHand} ${m.unit} on hand, below the ${Number(m.reorderThreshold)} ${m.unit} threshold`,
          link: "/warehouses",
          occurredAt: m.stockMovements[0]?.createdAt ?? m.createdAt,
        };
      });
  }

  private async dueReminders(companyId: string): Promise<NotificationItem[]> {
    const cutoff = new Date(Date.now() + REMINDER_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const reminders = await this.prisma.clientReminder.findMany({
      where: { companyId, done: false, dueDate: { lte: cutoff } },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
    });

    const now = new Date();
    return reminders.map((r) => ({
      key: `reminder:${r.id}`,
      type: "reminder_due" as const,
      severity: (r.dueDate < now ? "critical" : "warning") as Severity,
      title: r.title,
      body: `${r.client.name} — due ${r.dueDate.toLocaleDateString()}`,
      link: `/clients/${r.clientId}`,
      // createdAt, not dueDate — dueDate can be in the future, which would make the
      // unread check (occurredAt > lastViewedAt) permanently true and never settle.
      occurredAt: r.createdAt,
    }));
  }

  private async overdueInvoices(companyId: string): Promise<NotificationItem[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: { not: "void" }, dueDate: { not: null, lt: new Date() } },
      include: { payments: true, client: { select: { name: true } } },
    });

    return invoices
      .map((inv) => {
        const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const outstanding = Number(inv.total) - paid;
        return { inv, outstanding };
      })
      .filter(({ outstanding }) => outstanding > 0.01)
      .map(({ inv, outstanding }) => ({
        key: `invoice:${inv.id}`,
        type: "invoice_overdue" as const,
        severity: (Math.round((Date.now() - inv.dueDate!.getTime()) / 86_400_000) > 30
          ? "critical"
          : "warning") as Severity,
        title: `Invoice ${inv.number} is overdue`,
        body: `${inv.client.name} — ${Math.round(outstanding * 100) / 100} outstanding`,
        link: `/invoices/${inv.id}`,
        occurredAt: inv.dueDate!,
      }));
  }

  private async openRfis(companyId: string): Promise<NotificationItem[]> {
    const now = new Date();
    const rfis = await this.prisma.rfi.findMany({
      where: { companyId, status: "open" },
      include: { project: { select: { id: true, name: true } } },
    });

    return rfis.map((rfi) => ({
      key: `rfi:${rfi.id}`,
      type: "rfi_open" as const,
      severity: (rfi.dueDate && rfi.dueDate < now ? "critical" : "warning") as Severity,
      title: `${rfi.number}: ${rfi.subject}`,
      body: `${rfi.project.name} — awaiting an answer`,
      link: `/projects/${rfi.project.id}`,
      occurredAt: rfi.createdAt,
    }));
  }

  private async openPunchListItems(companyId: string): Promise<NotificationItem[]> {
    const now = new Date();
    const items = await this.prisma.punchListItem.findMany({
      where: { companyId, status: "open" },
      include: { project: { select: { id: true, name: true } } },
    });

    return items.map((item) => ({
      key: `punch_list:${item.id}`,
      type: "punch_list_open" as const,
      severity: (item.dueDate && item.dueDate < now ? "critical" : "warning") as Severity,
      title: item.title,
      body: `${item.project.name}${item.location ? ` — ${item.location}` : ""}`,
      link: `/projects/${item.project.id}`,
      occurredAt: item.createdAt,
    }));
  }

  private async pendingSubmittals(companyId: string): Promise<NotificationItem[]> {
    // A whole chain's status lives on its latest revision — an earlier revision's status
    // (e.g. "revise_and_resubmit" before it was superseded) is history, not a current pending item.
    const all = await this.prisma.submittal.findMany({
      where: { companyId },
      include: { project: { select: { id: true, name: true } } },
    });
    const latestByChain = new Map<string, (typeof all)[number]>();
    for (const s of all) {
      const chainKey = s.rootSubmittalId ?? s.id;
      const existing = latestByChain.get(chainKey);
      if (!existing || s.revision > existing.revision) latestByChain.set(chainKey, s);
    }
    const submittals = Array.from(latestByChain.values()).filter(
      (s) => s.status === "submitted" || s.status === "revise_and_resubmit",
    );

    return submittals.map((s) => ({
      key: `submittal:${s.id}`,
      type: "submittal_pending" as const,
      severity: (s.status === "revise_and_resubmit" ? "critical" : "warning") as Severity,
      title: `${s.number}${s.revision > 0 ? ` rev.${s.revision}` : ""}: ${s.title}`,
      body: `${s.project.name} — ${s.status === "revise_and_resubmit" ? "needs resubmission" : "awaiting review"}`,
      link: `/projects/${s.project.id}`,
      occurredAt: s.createdAt,
    }));
  }

  private async safetyIncidents(companyId: string): Promise<NotificationItem[]> {
    const incidents = await this.prisma.incidentReport.findMany({
      where: { companyId },
      include: { project: { select: { id: true, name: true } } },
    });

    return incidents.map((incident) => ({
      key: `incident:${incident.id}`,
      type: "safety_incident" as const,
      severity: (incident.severity === "lost_time_injury" || incident.severity === "fatality" ? "critical" : "warning") as Severity,
      title: `${incident.severity.replace(/_/g, " ")} incident logged`,
      body: `${incident.project.name}${incident.location ? ` — ${incident.location}` : ""}`,
      link: `/projects/${incident.project.id}`,
      occurredAt: incident.createdAt,
    }));
  }

  private async openWarrantyClaims(companyId: string): Promise<NotificationItem[]> {
    const claims = await this.prisma.warrantyClaim.findMany({
      where: { companyId, status: "open" },
      include: { project: { select: { id: true, name: true } } },
    });

    return claims.map((claim) => ({
      key: `warranty_claim:${claim.id}`,
      // A client submitting their own claim is more time-sensitive than one the office already knows about.
      severity: (claim.submittedByClientId ? "critical" : "warning") as Severity,
      type: "warranty_claim_open" as const,
      title: claim.title,
      body: `${claim.project.name}${claim.location ? ` — ${claim.location}` : ""}`,
      link: `/projects/${claim.project.id}`,
      occurredAt: claim.createdAt,
    }));
  }

  /** The one branch of this service that's genuinely per-user, not company-wide — a mention is personal. */
  private async mentions(companyId: string, userId: string): Promise<NotificationItem[]> {
    const mentions = await this.prisma.commentMention.findMany({
      where: { userId, comment: { companyId } },
      include: {
        comment: {
          include: {
            task: { include: { project: { select: { id: true, name: true } } } },
            rfi: { include: { project: { select: { id: true, name: true } } } },
            punchListItem: { include: { project: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return mentions.map((m) => {
      const project = m.comment.task?.project ?? m.comment.rfi?.project ?? m.comment.punchListItem?.project;
      const targetLabel = m.comment.task?.name ?? m.comment.rfi?.subject ?? m.comment.punchListItem?.title ?? "";
      return {
        key: `mention:${m.id}`,
        type: "mention" as const,
        severity: "warning" as Severity,
        title: `${m.comment.authorName} mentioned you`,
        body: `${targetLabel}${project ? ` — ${project.name}` : ""}: ${m.comment.content.slice(0, 100)}`,
        link: project ? `/projects/${project.id}` : "/dashboard",
        occurredAt: m.createdAt,
      };
    });
  }

  private async expiringSubcontractorDocuments(companyId: string): Promise<NotificationItem[]> {
    const cutoff = new Date(Date.now() + DOCUMENT_EXPIRY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const docs = await this.prisma.subcontractorDocument.findMany({
      where: { companyId, expiresAt: { lte: cutoff } },
      include: { subcontractor: { select: { name: true } } },
    });

    const now = new Date();
    return docs.map((doc) => ({
      key: `subcontractor_document:${doc.id}`,
      type: "subcontractor_document_expiring" as const,
      severity: (doc.expiresAt < now ? "critical" : "warning") as Severity,
      title: `${doc.name} — ${doc.subcontractor.name}`,
      body:
        doc.expiresAt < now
          ? `Expired ${doc.expiresAt.toLocaleDateString()}`
          : `Expires ${doc.expiresAt.toLocaleDateString()}`,
      link: "/subcontractors",
      occurredAt: doc.expiresAt,
    }));
  }

  private async expiringWorkerCertifications(companyId: string): Promise<NotificationItem[]> {
    const cutoff = new Date(Date.now() + DOCUMENT_EXPIRY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const certs = await this.prisma.workerCertification.findMany({
      where: { companyId, expiresAt: { lte: cutoff } },
      include: { worker: { select: { id: true, name: true } } },
    });

    const now = new Date();
    return certs.map((cert) => ({
      key: `worker_certification:${cert.id}`,
      type: "worker_certification_expiring" as const,
      severity: (cert.expiresAt < now ? "critical" : "warning") as Severity,
      title: `${cert.name} — ${cert.worker.name}`,
      body:
        cert.expiresAt < now
          ? `Expired ${cert.expiresAt.toLocaleDateString()}`
          : `Expires ${cert.expiresAt.toLocaleDateString()}`,
      link: `/team/${cert.worker.id}`,
      occurredAt: cert.expiresAt,
    }));
  }

  /**
   * Flags outdoor-marked tasks starting within the forecast window (Open-Meteo only covers
   * ~7 days out) whose start date lands on a risky forecast day. One geocode+forecast call
   * per project, not per task. occurredAt is floored to today rather than the (future)
   * startDate — same reasoning as dueReminders: a future occurredAt would make the unread
   * check permanently true. Flooring to today (not task.createdAt) means a risk resurfaces
   * once per day for as long as it's forecast, which matches how weather itself changes —
   * unlike the other sources here, this one doesn't self-clear from a single stable fact.
   */
  private async weatherRiskTasks(companyId: string): Promise<NotificationItem[]> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const cutoff = new Date(startOfToday.getTime() + WEATHER_RISK_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

    const tasks = await this.prisma.task.findMany({
      where: {
        isOutdoorWork: true,
        status: { not: "done" },
        startDate: { gte: startOfToday, lte: cutoff },
        project: { companyId },
      },
      include: { project: { select: { id: true, name: true, address: true } } },
    });
    if (tasks.length === 0) return [];

    const tasksByProject = new Map<string, typeof tasks>();
    for (const task of tasks) {
      if (!task.project.address) continue;
      const list = tasksByProject.get(task.projectId) ?? [];
      list.push(task);
      tasksByProject.set(task.projectId, list);
    }

    const items: NotificationItem[] = [];
    for (const projectTasks of tasksByProject.values()) {
      const project = projectTasks[0].project;
      const coords = await this.weather.geocode(project.address!);
      if (!coords) continue;
      const days = await this.weather.forecast(coords.lat, coords.lon, 0);

      for (const task of projectTasks) {
        const dateStr = task.startDate!.toISOString().slice(0, 10);
        const day = days.find((d) => d.date === dateStr);
        if (!day?.risky) continue;

        items.push({
          key: `weather_risk:${task.id}`,
          type: "weather_risk" as const,
          severity: (day.condition === "extreme_heat" || day.condition === "extreme_cold" || day.condition === "snow"
            ? "critical"
            : "warning") as Severity,
          title: `${task.name} may be affected by weather`,
          body: `${project.name} — ${day.condition.replace("_", " ")} forecast on ${task.startDate!.toLocaleDateString()}`,
          link: `/projects/${project.id}`,
          occurredAt: startOfToday,
        });
      }
    }
    return items;
  }

  /** Flags any project whose combined actual cost (materials + labor + subcontractor) has
   * reached BUDGET_OVERRUN_THRESHOLD of its budgeted grand total — only projects with at least
   * one approved estimate have a budget to compare against, so unestimated projects are silent. */
  private async budgetOverruns(companyId: string): Promise<NotificationItem[]> {
    const projects = await this.prisma.project.findMany({ where: { companyId }, select: { id: true, name: true } });

    const items: NotificationItem[] = [];
    for (const project of projects) {
      const b = await this.budget.getForProject(companyId, project.id);
      if (b.grandTotalBudget <= 0) continue;

      const actualTotal = b.materialsCostActual + b.laborCostActual + b.subcontractorCostActual;
      const ratio = actualTotal / b.grandTotalBudget;
      if (ratio < BUDGET_OVERRUN_THRESHOLD) continue;

      items.push({
        key: `budget_overrun:${project.id}`,
        type: "budget_overrun" as const,
        severity: (ratio >= 1 ? "critical" : "warning") as Severity,
        title: `${project.name} is ${ratio >= 1 ? "over budget" : "close to its budget"}`,
        body: `${Math.round(ratio * 100)}% of budget spent (${actualTotal.toFixed(2)} of ${b.grandTotalBudget.toFixed(2)})`,
        link: `/projects/${project.id}`,
        occurredAt: new Date(),
      });
    }
    return items;
  }
}
