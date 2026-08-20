import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

export type Severity = "warning" | "critical";

export interface NotificationItem {
  key: string;
  type: "low_stock" | "reminder_due" | "invoice_overdue" | "rfi_open" | "punch_list_open" | "submittal_pending" | "safety_incident";
  severity: Severity;
  title: string;
  body: string;
  link: string;
  occurredAt: Date;
}

const REMINDER_LOOKAHEAD_DAYS = 3;

/**
 * Notifications are fully derived from live data, not a persisted table —
 * each source is naturally self-clearing (restock resolves low-stock,
 * completing a reminder resolves it, paying an invoice resolves it), so
 * there is nothing to reconcile or expire. The only persisted state is
 * Membership.notificationsLastViewedAt, which drives the unread badge.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, userId: string) {
    const [lowStock, reminders, invoices, openRfis, openPunchItems, pendingSubmittals, incidents, membership] = await Promise.all([
      this.lowStockItems(companyId),
      this.dueReminders(companyId),
      this.overdueInvoices(companyId),
      this.openRfis(companyId),
      this.openPunchListItems(companyId),
      this.pendingSubmittals(companyId),
      this.safetyIncidents(companyId),
      this.prisma.membership.findFirst({ where: { companyId, userId } }),
    ]);

    const items = [...lowStock, ...reminders, ...invoices, ...openRfis, ...openPunchItems, ...pendingSubmittals, ...incidents].sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
    );

    const lastViewedAt = membership?.notificationsLastViewedAt ?? null;
    const unreadCount = lastViewedAt
      ? items.filter((n) => n.occurredAt.getTime() > lastViewedAt.getTime()).length
      : items.length;

    return { unreadCount, notifications: items };
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
}
