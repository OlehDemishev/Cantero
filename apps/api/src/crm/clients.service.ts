import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CLIENT_STAGE_DEFAULT_PROBABILITY,
  CLIENT_STAGES,
  type AddClientActivityInput,
  type AddClientReminderInput,
  type ConvertClientToProjectInput,
  type CreateClientInput,
  type ImportResult,
  type MoveClientStageInput,
  type UpdateClientInput,
  type UpdateReferralRewardInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { parseCsvRecords } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    private readonly projects: ProjectsService,
  ) {}

  list(companyId: string) {
    return this.prisma.client.findMany({
      where: { companyId },
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, companyId },
      include: {
        owner: { select: { id: true, name: true } },
        referredBy: { select: { id: true, name: true } },
        referrals: { select: { id: true, name: true, stage: true } },
      },
    });
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  async create(companyId: string, input: CreateClientInput) {
    if (input.ownerWorkerId) await this.assertWorker(companyId, input.ownerWorkerId);
    if (input.referredByClientId) await this.assertClient(companyId, input.referredByClientId);
    const client = await this.prisma.client.create({
      data: {
        ...input,
        companyId,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
      },
    });
    await this.prisma.clientStageHistory.create({
      data: { companyId, clientId: client.id, fromStage: null, toStage: client.stage },
    });
    return client;
  }

  async update(companyId: string, id: string, input: UpdateClientInput) {
    await this.get(companyId, id);
    if (input.ownerWorkerId) await this.assertWorker(companyId, input.ownerWorkerId);
    if (input.referredByClientId) {
      if (input.referredByClientId === id) throw new BadRequestException("A client can't refer itself");
      await this.assertClient(companyId, input.referredByClientId);
    }
    return this.prisma.client.update({
      where: { id },
      data: {
        ...input,
        expectedCloseDate:
          input.expectedCloseDate === undefined ? undefined : input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
      },
    });
  }

  /** Stage transitions are the only path to won/lost — this is where wonAt/lostAt/lostReason and audit/webhooks live. */
  async moveStage(companyId: string, actor: AuditActor, id: string, input: MoveClientStageInput) {
    const client = await this.get(companyId, id);
    if (client.stage === input.stage) throw new BadRequestException(`Client is already in stage "${input.stage}"`);

    const updated = await this.prisma.client.update({
      where: { id: client.id },
      data: {
        stage: input.stage,
        wonAt: input.stage === "won" ? new Date() : null,
        lostAt: input.stage === "lost" ? new Date() : null,
        lostReason: input.stage === "lost" ? input.lostReason : null,
      },
      include: { owner: { select: { id: true, name: true } } },
    });
    await this.prisma.clientStageHistory.create({
      data: { companyId, clientId: client.id, fromStage: client.stage, toStage: input.stage },
    });
    this.audit.record(companyId, actor, "client.stage_changed", "Client", client.id, `Moved "${client.name}" to ${input.stage}`);
    if (input.stage === "won") {
      this.webhooks.trigger(companyId, "client.won", { clientId: client.id, name: client.name });
      if (client.referredByClientId) await this.markReferralRewardPending(companyId, client.referredByClientId);
    }
    if (input.stage === "lost") this.webhooks.trigger(companyId, "client.lost", { clientId: client.id, name: client.name });
    return updated;
  }

  /** Flags the referring client's reward as owed once a client they referred reaches "won" —
   * only if it's still "none", so an already-tracked/paid reward from an earlier referral isn't reset. */
  private async markReferralRewardPending(companyId: string, referrerClientId: string) {
    await this.prisma.client.updateMany({
      where: { id: referrerClientId, companyId, referralRewardStatus: "none" },
      data: { referralRewardStatus: "pending" },
    });
  }

  /** Manual amount/status control over a referrer's reward — no payment-processor integration,
   * so marking it "paid" is purely a record-keeping action here. */
  async updateReferralReward(companyId: string, actor: AuditActor, id: string, input: UpdateReferralRewardInput) {
    const client = await this.get(companyId, id);
    const updated = await this.prisma.client.update({
      where: { id: client.id },
      data: {
        ...(input.status !== undefined ? { referralRewardStatus: input.status } : {}),
        ...(input.amount !== undefined ? { referralRewardAmount: input.amount } : {}),
      },
    });
    this.audit.record(companyId, actor, "client.referral_reward_updated", "Client", client.id, `Updated referral reward for "${client.name}"`);
    return updated;
  }

  async convertToProject(companyId: string, actor: AuditActor, id: string, input: ConvertClientToProjectInput) {
    const client = await this.get(companyId, id);
    if (client.stage !== "won") throw new BadRequestException("Only a won client can be converted to a project");

    const project = await this.projects.create(companyId, { name: input.name, address: input.address, clientId: client.id });
    this.audit.record(companyId, actor, "client.converted_to_project", "Client", client.id, `Converted "${client.name}" to project "${project.name}"`);
    return project;
  }

  /** Deal count + total estimated value per stage, in pipeline order — the CRM board's summary strip. */
  async pipelineSummary(companyId: string) {
    const clients = await this.prisma.client.findMany({
      where: { companyId },
      select: { stage: true, estimatedValue: true },
    });
    return CLIENT_STAGES.map((stage) => {
      const inStage = clients.filter((c) => c.stage === stage);
      return {
        stage,
        count: inStage.length,
        totalValue: inStage.reduce((sum, c) => sum + Number(c.estimatedValue ?? 0), 0),
      };
    });
  }

  /** Weighted pipeline value for still-open deals — estimatedValue x probability (manual override,
   * falling back to the stage's default), bucketed by expected close month so "how much might we
   * close, and when" reads directly off the report. */
  async pipelineForecast(companyId: string) {
    const clients = await this.prisma.client.findMany({
      where: { companyId, stage: { in: ["lead", "contacted", "qualified"] } },
      select: { id: true, name: true, stage: true, estimatedValue: true, probability: true, expectedCloseDate: true },
    });

    const deals = clients.map((c) => {
      const probability = c.probability ?? CLIENT_STAGE_DEFAULT_PROBABILITY[c.stage];
      const weightedValue = (Number(c.estimatedValue ?? 0) * probability) / 100;
      return {
        clientId: c.id,
        name: c.name,
        stage: c.stage,
        estimatedValue: Number(c.estimatedValue ?? 0),
        probability,
        expectedCloseDate: c.expectedCloseDate,
        weightedValue,
      };
    });

    const byMonth = new Map<string, number>();
    let unscheduled = 0;
    for (const deal of deals) {
      if (!deal.expectedCloseDate) {
        unscheduled += deal.weightedValue;
        continue;
      }
      const key = `${deal.expectedCloseDate.getFullYear()}-${String(deal.expectedCloseDate.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + deal.weightedValue);
    }

    return {
      totalWeightedValue: deals.reduce((sum, d) => sum + d.weightedValue, 0),
      unscheduledWeightedValue: unscheduled,
      byMonth: Array.from(byMonth.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([month, weightedValue]) => ({ month, weightedValue })),
      deals: deals.sort((a, b) => b.weightedValue - a.weightedValue),
    };
  }

  /** Win rate + average days spent in each stage, computed from the ClientStageHistory trail
   * rather than the generic AuditLog — gives real pipeline-velocity numbers, not just a snapshot. */
  async funnelReport(companyId: string) {
    const [clients, history] = await Promise.all([
      this.prisma.client.findMany({ where: { companyId }, select: { id: true, stage: true, wonAt: true, lostAt: true } }),
      this.prisma.clientStageHistory.findMany({ where: { companyId }, orderBy: { changedAt: "asc" } }),
    ]);

    const wonCount = clients.filter((c) => c.stage === "won").length;
    const lostCount = clients.filter((c) => c.stage === "lost").length;
    const decidedCount = wonCount + lostCount;
    const winRatePercent = decidedCount > 0 ? (wonCount / decidedCount) * 100 : null;

    const everReachedStage = new Map<string, Set<string>>();
    for (const stage of CLIENT_STAGES) everReachedStage.set(stage, new Set());
    const byClient = new Map<string, typeof history>();
    for (const row of history) {
      everReachedStage.get(row.toStage)!.add(row.clientId);
      if (!byClient.has(row.clientId)) byClient.set(row.clientId, []);
      byClient.get(row.clientId)!.push(row);
    }

    const stageDurationsMs = new Map<string, number[]>();
    for (const stage of CLIENT_STAGES) stageDurationsMs.set(stage, []);
    for (const rows of byClient.values()) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const next = rows[i + 1];
        const end = next ? next.changedAt : new Date();
        stageDurationsMs.get(row.toStage)!.push(end.getTime() - row.changedAt.getTime());
      }
    }

    const dayMs = 24 * 60 * 60 * 1000;
    const funnel = CLIENT_STAGES.map((stage) => {
      const durations = stageDurationsMs.get(stage)!;
      return {
        stage,
        everReachedCount: everReachedStage.get(stage)!.size,
        avgDaysInStage: durations.length > 0 ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length / dayMs : null,
      };
    });

    return { winRatePercent, wonCount, lostCount, funnel };
  }

  /** Per-owner snapshot: how much each salesperson currently has open vs. has closed won,
   * for a simple performance leaderboard. */
  async ownerLeaderboard(companyId: string) {
    const clients = await this.prisma.client.findMany({
      where: { companyId, ownerWorkerId: { not: null } },
      select: { ownerWorkerId: true, owner: { select: { name: true } }, stage: true, estimatedValue: true },
    });

    const byOwner = new Map<string, { ownerWorkerId: string; ownerName: string; openCount: number; openValue: number; wonCount: number; wonValue: number }>();
    for (const c of clients) {
      const key = c.ownerWorkerId!;
      if (!byOwner.has(key)) {
        byOwner.set(key, { ownerWorkerId: key, ownerName: c.owner?.name ?? "—", openCount: 0, openValue: 0, wonCount: 0, wonValue: 0 });
      }
      const entry = byOwner.get(key)!;
      const value = Number(c.estimatedValue ?? 0);
      if (c.stage === "won") {
        entry.wonCount++;
        entry.wonValue += value;
      } else if (c.stage !== "lost") {
        entry.openCount++;
        entry.openValue += value;
      }
    }

    return Array.from(byOwner.values()).sort((a, b) => b.wonValue - a.wonValue);
  }

  private async assertWorker(companyId: string, workerId: string) {
    const worker = await this.prisma.worker.findFirst({ where: { id: workerId, companyId } });
    if (!worker) throw new BadRequestException("Owner does not belong to this company");
    return worker;
  }

  private async assertClient(companyId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, companyId } });
    if (!client) throw new BadRequestException("Referring client does not belong to this company");
    return client;
  }

  /** CSV columns: name (required), email, phone. */
  async importCsv(companyId: string, actor: AuditActor, csv: string): Promise<ImportResult> {
    const records = parseCsvRecords(csv);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };
    const toCreate: { name: string; email: string | null; phone: string | null }[] = [];

    records.forEach((record, index) => {
      const row = index + 2; // header is row 1
      const name = record.name?.trim();
      if (!name) {
        result.skipped++;
        result.errors.push({ row, message: "Missing name" });
        return;
      }
      toCreate.push({ name, email: record.email?.trim() || null, phone: record.phone?.trim() || null });
    });

    if (toCreate.length > 0) {
      await this.prisma.client.createMany({ data: toCreate.map((c) => ({ ...c, companyId })) });
      result.created = toCreate.length;
    }

    this.audit.record(
      companyId,
      actor,
      "clients.imported",
      "Client",
      companyId,
      `Imported ${result.created} clients from CSV (${result.skipped} skipped)`,
    );

    return result;
  }

  async listActivities(companyId: string, clientId: string) {
    await this.get(companyId, clientId);
    return this.prisma.clientActivity.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } });
  }

  async addActivity(companyId: string, clientId: string, input: AddClientActivityInput) {
    await this.get(companyId, clientId);
    return this.prisma.clientActivity.create({
      data: { companyId, clientId, type: input.type, content: input.content },
    });
  }

  async listReminders(companyId: string, clientId: string) {
    await this.get(companyId, clientId);
    return this.prisma.clientReminder.findMany({ where: { clientId }, orderBy: { dueDate: "asc" } });
  }

  async addReminder(companyId: string, clientId: string, input: AddClientReminderInput) {
    await this.get(companyId, clientId);
    return this.prisma.clientReminder.create({
      data: { companyId, clientId, title: input.title, dueDate: new Date(input.dueDate) },
    });
  }

  async completeReminder(companyId: string, clientId: string, reminderId: string) {
    await this.get(companyId, clientId);
    const reminder = await this.prisma.clientReminder.findFirst({ where: { id: reminderId, clientId } });
    if (!reminder) throw new NotFoundException("Reminder not found");
    return this.prisma.clientReminder.update({ where: { id: reminderId }, data: { done: true } });
  }

  /** Not-yet-done reminders company-wide, soonest first — a small "what needs follow-up" list. */
  listUpcomingReminders(companyId: string) {
    return this.prisma.clientReminder.findMany({
      where: { companyId, done: false },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 20,
    });
  }
}
