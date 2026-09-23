import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { WeatherService } from "../weather/weather.service";
import { BudgetService } from "../finance/budget.service";
import { JobCostingService } from "../job-costing/job-costing.service";
import { calculateCostCodeOverruns } from "../job-costing/cost-code-overrun";
import { ProjectAccessService } from "../common/project-access/project-access.service";

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
    | "supplier_document_expiring"
    | "worker_certification_expiring"
    | "permit_expiring"
    | "company_document_expiring"
    | "weather_risk"
    | "budget_overrun"
    | "cost_code_overrun"
    | "material_price_changed"
    | "drawing_set_ready";
  severity: Severity;
  title: string;
  body: string;
  link: string;
  occurredAt: Date;
  /** The project this is about, if any — list() drops items of a restricted project the reader
   * isn't a member of. */
  projectId?: string;
}

const REMINDER_LOOKAHEAD_DAYS = 3;
const DOCUMENT_EXPIRY_LOOKAHEAD_DAYS = 30;
const WEATHER_RISK_LOOKAHEAD_DAYS = 7;
const MATERIAL_PRICE_CHANGE_LOOKBACK_DAYS = 14;
/** A drawing set that was read (or couldn't be) stays in the uploader's feed this long, or until imported or discarded. */
const DRAWING_SET_LOOKBACK_DAYS = 14;
/** This is a "what's new" activity feed fanning out into ~15 independent queries, not a list a
 * user pages through — there's no shared cursor across tables that would make sense to page. Each
 * source caps itself at its most urgent/recent N instead, bounding the whole fan-out to a small,
 * predictable number of rows regardless of company size. 100 (rather than a tighter number like
 * 20) because several sources filter further in memory after the fetch (lowStockItems checks
 * on-hand-vs-threshold, overdueInvoices nets out payments, pendingSubmittals groups by revision
 * chain) — a tight cap risks silently hiding a real alert behind rows that get filtered out
 * afterward. See AUDIT-2026-09-07.md. */
const NOTIFICATION_SOURCE_LIMIT = 100;

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
    private readonly jobCosting: JobCostingService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async list(companyId: string, userId: string, role?: string) {
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
      expiringSupplierDocuments,
      expiringWorkerCertifications,
      expiringPermits,
      expiringCompanyDocuments,
      weatherRisks,
      budgetOverruns,
      costCodeOverruns,
      materialPriceChanges,
      drawingSets,
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
      this.expiringSupplierDocuments(companyId),
      this.expiringWorkerCertifications(companyId),
      this.expiringPermits(companyId),
      this.expiringCompanyDocuments(companyId),
      this.weatherRiskTasks(companyId),
      this.budgetOverruns(companyId),
      this.costCodeOverruns(companyId),
      this.materialPriceChanges(companyId),
      this.drawingSets(companyId, userId),
      this.prisma.membership.findFirst({ where: { companyId, userId } }),
    ]);

    const mutedTypes = new Set(membership?.mutedNotificationTypes ?? []);
    const hiddenProjects = new Set(await this.projectAccess.hiddenProjectIds(companyId, userId, role));
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
      ...expiringSupplierDocuments,
      ...expiringWorkerCertifications,
      ...expiringPermits,
      ...expiringCompanyDocuments,
      ...weatherRisks,
      ...budgetOverruns,
      ...costCodeOverruns,
      ...materialPriceChanges,
      ...drawingSets,
    ]
      .filter((n) => !mutedTypes.has(n.type) && !(n.projectId && hiddenProjects.has(n.projectId)))
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

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
      take: NOTIFICATION_SOURCE_LIMIT,
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
      take: NOTIFICATION_SOURCE_LIMIT,
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
      orderBy: { dueDate: "asc" },
      take: NOTIFICATION_SOURCE_LIMIT,
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
        projectId: inv.projectId ?? undefined,
        link: `/invoices/${inv.id}`,
        occurredAt: inv.dueDate!,
      }));
  }

  private async openRfis(companyId: string): Promise<NotificationItem[]> {
    const now = new Date();
    const rfis = await this.prisma.rfi.findMany({
      where: { companyId, status: "open" },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_SOURCE_LIMIT,
    });

    return rfis.map((rfi) => ({
      key: `rfi:${rfi.id}`,
      type: "rfi_open" as const,
      severity: (rfi.dueDate && rfi.dueDate < now ? "critical" : "warning") as Severity,
      title: `${rfi.number}: ${rfi.subject}`,
      body: `${rfi.project.name} — awaiting an answer`,
      projectId: rfi.project.id,
      link: `/projects/${rfi.project.id}`,
      occurredAt: rfi.createdAt,
    }));
  }

  private async openPunchListItems(companyId: string): Promise<NotificationItem[]> {
    const now = new Date();
    const items = await this.prisma.punchListItem.findMany({
      where: { companyId, status: "open" },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_SOURCE_LIMIT,
    });

    return items.map((item) => ({
      key: `punch_list:${item.id}`,
      type: "punch_list_open" as const,
      severity: (item.dueDate && item.dueDate < now ? "critical" : "warning") as Severity,
      title: item.title,
      body: `${item.project.name}${item.location ? ` — ${item.location}` : ""}`,
      projectId: item.project.id,
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
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_SOURCE_LIMIT,
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
      projectId: s.project.id,
      link: `/projects/${s.project.id}`,
      occurredAt: s.createdAt,
    }));
  }

  private async safetyIncidents(companyId: string): Promise<NotificationItem[]> {
    const incidents = await this.prisma.incidentReport.findMany({
      where: { companyId },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_SOURCE_LIMIT,
    });

    return incidents.map((incident) => ({
      key: `incident:${incident.id}`,
      type: "safety_incident" as const,
      severity: (incident.severity === "lost_time_injury" || incident.severity === "fatality" ? "critical" : "warning") as Severity,
      title: `${incident.severity.replace(/_/g, " ")} incident logged`,
      body: `${incident.project.name}${incident.location ? ` — ${incident.location}` : ""}`,
      projectId: incident.project.id,
      link: `/projects/${incident.project.id}`,
      occurredAt: incident.createdAt,
    }));
  }

  private async openWarrantyClaims(companyId: string): Promise<NotificationItem[]> {
    const claims = await this.prisma.warrantyClaim.findMany({
      where: { companyId, status: "open" },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_SOURCE_LIMIT,
    });

    return claims.map((claim) => ({
      key: `warranty_claim:${claim.id}`,
      // A client submitting their own claim is more time-sensitive than one the office already knows about.
      severity: (claim.submittedByClientId ? "critical" : "warning") as Severity,
      type: "warranty_claim_open" as const,
      title: claim.title,
      body: `${claim.project.name}${claim.location ? ` — ${claim.location}` : ""}`,
      projectId: claim.project.id,
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
      take: NOTIFICATION_SOURCE_LIMIT,
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
        projectId: project?.id,
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
      orderBy: { expiresAt: "asc" },
      take: NOTIFICATION_SOURCE_LIMIT,
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

  private async expiringSupplierDocuments(companyId: string): Promise<NotificationItem[]> {
    const cutoff = new Date(Date.now() + DOCUMENT_EXPIRY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const docs = await this.prisma.supplierDocument.findMany({
      where: { companyId, expiresAt: { lte: cutoff } },
      include: { supplier: { select: { name: true } } },
      orderBy: { expiresAt: "asc" },
      take: NOTIFICATION_SOURCE_LIMIT,
    });

    const now = new Date();
    return docs.map((doc) => ({
      key: `supplier_document:${doc.id}`,
      type: "supplier_document_expiring" as const,
      severity: (doc.expiresAt < now ? "critical" : "warning") as Severity,
      title: `${doc.name} — ${doc.supplier.name}`,
      body:
        doc.expiresAt < now
          ? `Expired ${doc.expiresAt.toLocaleDateString()}`
          : `Expires ${doc.expiresAt.toLocaleDateString()}`,
      link: "/suppliers",
      occurredAt: doc.expiresAt,
    }));
  }

  private async materialPriceChanges(companyId: string): Promise<NotificationItem[]> {
    const cutoff = new Date(Date.now() - MATERIAL_PRICE_CHANGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const changes = await this.prisma.materialPriceChange.findMany({
      where: { companyId, createdAt: { gte: cutoff } },
      include: { materialCatalogItem: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_SOURCE_LIMIT,
    });

    return changes.map((change) => ({
      key: `material_price_change:${change.id}`,
      type: "material_price_changed" as const,
      severity: (Math.abs(Number(change.changePercent)) >= 25 ? "critical" : "warning") as Severity,
      title: change.materialCatalogItem.name,
      body: `Price ${Number(change.changePercent) > 0 ? "rose" : "fell"} ${Math.abs(Number(change.changePercent))}% (${change.oldPrice} → ${change.newPrice})`,
      link: `/rate-catalog`,
      occurredAt: change.createdAt,
    }));
  }

  /** Personal, like a mention: the person who uploaded a drawing set hears when it has been read in
   * the background and is waiting for their review — or that it couldn't be read. Gone once the set
   * is imported or discarded. */
  private async drawingSets(companyId: string, userId: string): Promise<NotificationItem[]> {
    const cutoff = new Date(Date.now() - DRAWING_SET_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const sets = await this.prisma.drawingSet.findMany({
      where: { companyId, uploadedByUserId: userId, status: { in: ["ready", "failed"] }, importedAt: null, finishedAt: { gte: cutoff } },
      select: { id: true, fileName: true, status: true, pageCount: true, finishedAt: true, project: { select: { id: true, name: true } } },
      orderBy: { finishedAt: "desc" },
      take: NOTIFICATION_SOURCE_LIMIT,
    });
    return sets.map((set) => ({
      key: `drawing_set:${set.id}:${set.status}`,
      type: "drawing_set_ready" as const,
      severity: (set.status === "failed" ? "critical" : "warning") as Severity,
      title: set.status === "failed" ? "Drawing set couldn't be read" : "Drawing set ready for review",
      body: `${set.fileName}${set.status === "failed" ? "" : ` — ${set.pageCount} pages`} · ${set.project.name}`,
      projectId: set.project.id,
      link: `/projects/${set.project.id}?tab=documents&drawingSet=${set.id}`,
      occurredAt: set.finishedAt!,
    }));
  }

  private async expiringPermits(companyId: string): Promise<NotificationItem[]> {
    const cutoff = new Date(Date.now() + DOCUMENT_EXPIRY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const permits = await this.prisma.permit.findMany({
      where: { companyId, expiresAt: { not: null, lte: cutoff } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { expiresAt: "asc" },
      take: NOTIFICATION_SOURCE_LIMIT,
    });

    const now = new Date();
    return permits.map((permit) => ({
      key: `permit:${permit.id}`,
      type: "permit_expiring" as const,
      severity: (permit.expiresAt! < now ? "critical" : "warning") as Severity,
      title: `${permit.permitType} — ${permit.project.name}`,
      body: permit.expiresAt! < now ? `Expired ${permit.expiresAt!.toLocaleDateString()}` : `Expires ${permit.expiresAt!.toLocaleDateString()}`,
      projectId: permit.project.id,
      link: `/projects/${permit.project.id}`,
      occurredAt: permit.expiresAt!,
    }));
  }

  private async expiringCompanyDocuments(companyId: string): Promise<NotificationItem[]> {
    const cutoff = new Date(Date.now() + DOCUMENT_EXPIRY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const docs = await this.prisma.companyDocument.findMany({
      where: { companyId, expiresAt: { lte: cutoff } },
      orderBy: { expiresAt: "asc" },
      take: NOTIFICATION_SOURCE_LIMIT,
    });

    const now = new Date();
    return docs.map((doc) => ({
      key: `company_document:${doc.id}`,
      type: "company_document_expiring" as const,
      severity: (doc.expiresAt < now ? "critical" : "warning") as Severity,
      title: doc.name,
      body: doc.expiresAt < now ? `Expired ${doc.expiresAt.toLocaleDateString()}` : `Expires ${doc.expiresAt.toLocaleDateString()}`,
      link: "/settings",
      occurredAt: doc.expiresAt,
    }));
  }

  private async expiringWorkerCertifications(companyId: string): Promise<NotificationItem[]> {
    const cutoff = new Date(Date.now() + DOCUMENT_EXPIRY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const certs = await this.prisma.workerCertification.findMany({
      where: { companyId, expiresAt: { lte: cutoff } },
      include: { worker: { select: { id: true, name: true } } },
      orderBy: { expiresAt: "asc" },
      take: NOTIFICATION_SOURCE_LIMIT,
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
      orderBy: { startDate: "asc" },
      take: NOTIFICATION_SOURCE_LIMIT,
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
          projectId: project.id,
          link: `/projects/${project.id}`,
          occurredAt: startOfToday,
        });
      }
    }
    return items;
  }

  /** Flags any project whose combined actual cost (materials + labor + subcontractor) has
   * reached Company.budgetAlertThresholdPercent (or the project's own override) of its budgeted
   * grand total — only projects with at least one approved estimate have a budget to compare
   * against, so unestimated projects are silent. */
  private async budgetOverruns(companyId: string): Promise<NotificationItem[]> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { budgetAlertThresholdPercent: true } });
    const projects = await this.prisma.project.findMany({
      where: { companyId },
      select: { id: true, name: true, budgetAlertThresholdPercent: true },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_SOURCE_LIMIT,
    });

    const items: NotificationItem[] = [];
    for (const project of projects) {
      const b = await this.budget.getForProject(companyId, project.id);
      if (b.grandTotalBudget <= 0) continue;

      const threshold = (project.budgetAlertThresholdPercent ?? company.budgetAlertThresholdPercent) / 100;
      const actualTotal = b.materialsCostActual + b.laborCostActual + b.subcontractorCostActual;
      const ratio = actualTotal / b.grandTotalBudget;
      if (ratio < threshold) continue;

      items.push({
        key: `budget_overrun:${project.id}`,
        type: "budget_overrun" as const,
        severity: (ratio >= 1 ? "critical" : "warning") as Severity,
        title: `${project.name} is ${ratio >= 1 ? "over budget" : "close to its budget"}`,
        body: `${Math.round(ratio * 100)}% of budget spent (${actualTotal.toFixed(2)} of ${b.grandTotalBudget.toFixed(2)})`,
        projectId: project.id,
        link: `/projects/${project.id}`,
        occurredAt: new Date(),
      });
    }
    return items;
  }

  /** Same threshold as budgetOverruns() but applied per cost code, so one blown code (e.g.
   * concrete running hot) surfaces even while the project total still looks fine. */
  private async costCodeOverruns(companyId: string): Promise<NotificationItem[]> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { budgetAlertThresholdPercent: true } });
    const projects = await this.prisma.project.findMany({
      where: { companyId },
      select: { id: true, name: true, budgetAlertThresholdPercent: true },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_SOURCE_LIMIT,
    });

    const items: NotificationItem[] = [];
    for (const project of projects) {
      const threshold = project.budgetAlertThresholdPercent ?? company.budgetAlertThresholdPercent;
      const { rows } = await this.jobCosting.report(companyId, project.id);
      const overruns = calculateCostCodeOverruns(rows, threshold);

      for (const overrun of overruns) {
        items.push({
          key: `cost_code_overrun:${project.id}:${overrun.costCodeId ?? "uncategorized"}`,
          type: "cost_code_overrun" as const,
          severity: overrun.severity,
          title: `${overrun.code} ${overrun.name} is ${overrun.severity === "critical" ? "over budget" : "close to its budget"} on ${project.name}`,
          body: `${Math.round(overrun.ratioPercent)}% of estimated spent (${overrun.spent.toFixed(2)} of ${overrun.estimated.toFixed(2)})`,
          projectId: project.id,
          link: `/projects/${project.id}`,
          occurredAt: new Date(),
        });
      }
    }
    return items;
  }
}
