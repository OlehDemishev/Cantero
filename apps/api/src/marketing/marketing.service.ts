import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateMarketingCampaignInput, UpdateMarketingCampaignInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const UNATTRIBUTED_CHANNEL = "unattributed";

@Injectable()
export class MarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listCampaigns(companyId: string) {
    return this.prisma.marketingCampaign.findMany({
      where: { companyId },
      include: { _count: { select: { clients: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async createCampaign(companyId: string, actor: AuditActor, input: CreateMarketingCampaignInput) {
    const campaign = await this.prisma.marketingCampaign.create({
      data: {
        companyId,
        name: input.name,
        channel: input.channel,
        spend: input.spend,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        notes: input.notes,
      },
    });
    this.audit.record(companyId, actor, "marketing_campaign.created", "MarketingCampaign", campaign.id, `Added campaign "${input.name}"`);
    return campaign;
  }

  async updateCampaign(companyId: string, actor: AuditActor, id: string, input: UpdateMarketingCampaignInput) {
    const existing = await this.findCampaignOrThrow(companyId, id);
    const updated = await this.prisma.marketingCampaign.update({
      where: { id },
      data: {
        name: input.name,
        channel: input.channel,
        spend: input.spend,
        startDate: input.startDate === undefined ? undefined : input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate === undefined ? undefined : input.endDate ? new Date(input.endDate) : null,
        notes: input.notes,
      },
    });
    this.audit.record(companyId, actor, "marketing_campaign.updated", "MarketingCampaign", id, `Updated campaign "${existing.name}"`);
    return updated;
  }

  /**
   * Groups every client by its campaign's channel (falling back to the client's own free-text
   * source, or "unattributed" when neither is set) and computes lead count, won count, conversion
   * rate, and — where campaign spend data exists for that channel — cost-per-lead and
   * cost-per-won-deal. Spend is summed per channel across all campaigns tagged with it, since more
   * than one campaign can share a channel (e.g. two different Google Ads pushes).
   */
  async roiByChannel(companyId: string) {
    const [clients, campaigns] = await Promise.all([
      this.prisma.client.findMany({
        where: { companyId },
        select: { id: true, stage: true, estimatedValue: true, source: true, campaign: { select: { channel: true } } },
      }),
      this.prisma.marketingCampaign.findMany({ where: { companyId }, select: { channel: true, spend: true } }),
    ]);

    const spendByChannel = new Map<string, number>();
    for (const c of campaigns) {
      spendByChannel.set(c.channel, (spendByChannel.get(c.channel) ?? 0) + Number(c.spend ?? 0));
    }

    const byChannel = new Map<string, { channel: string; leadCount: number; wonCount: number; wonValue: number }>();
    for (const client of clients) {
      const channel = client.campaign?.channel ?? client.source ?? UNATTRIBUTED_CHANNEL;
      if (!byChannel.has(channel)) byChannel.set(channel, { channel, leadCount: 0, wonCount: 0, wonValue: 0 });
      const entry = byChannel.get(channel)!;
      entry.leadCount++;
      if (client.stage === "won") {
        entry.wonCount++;
        entry.wonValue += Number(client.estimatedValue ?? 0);
      }
    }

    return Array.from(byChannel.values())
      .map((entry) => {
        const spend = spendByChannel.get(entry.channel) ?? null;
        return {
          ...entry,
          wonValue: round2(entry.wonValue),
          conversionRatePercent: entry.leadCount > 0 ? round2((entry.wonCount / entry.leadCount) * 100) : 0,
          spend,
          costPerLead: spend !== null && entry.leadCount > 0 ? round2(spend / entry.leadCount) : null,
          costPerWonDeal: spend !== null && entry.wonCount > 0 ? round2(spend / entry.wonCount) : null,
        };
      })
      .sort((a, b) => b.wonValue - a.wonValue);
  }

  private async findCampaignOrThrow(companyId: string, id: string) {
    const campaign = await this.prisma.marketingCampaign.findFirst({ where: { id, companyId } });
    if (!campaign) throw new NotFoundException("Marketing campaign not found");
    return campaign;
  }
}
