import { Test } from "@nestjs/testing";
import { MarketingService } from "./marketing.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("MarketingService", () => {
  let service: MarketingService;
  let prisma: {
    marketingCampaign: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    client: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      marketingCampaign: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      client: { findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        MarketingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(MarketingService);
  });

  describe("roiByChannel()", () => {
    it("groups clients by their campaign's channel and computes conversion rate", async () => {
      prisma.client.findMany.mockResolvedValue([
        { id: "c1", stage: "won", estimatedValue: 10000, source: null, campaign: { channel: "google_ads" } },
        { id: "c2", stage: "lead", estimatedValue: 5000, source: null, campaign: { channel: "google_ads" } },
      ]);
      prisma.marketingCampaign.findMany.mockResolvedValue([{ channel: "google_ads", spend: 500 }]);

      const result = await service.roiByChannel(COMPANY_A);

      expect(result).toHaveLength(1);
      expect(result[0].channel).toBe("google_ads");
      expect(result[0].leadCount).toBe(2);
      expect(result[0].wonCount).toBe(1);
      expect(result[0].conversionRatePercent).toBe(50);
      expect(result[0].wonValue).toBe(10000);
    });

    it("computes cost-per-lead and cost-per-won-deal when spend data exists", async () => {
      prisma.client.findMany.mockResolvedValue([
        { id: "c1", stage: "won", estimatedValue: 8000, source: null, campaign: { channel: "trade_show" } },
        { id: "c2", stage: "lead", estimatedValue: 2000, source: null, campaign: { channel: "trade_show" } },
      ]);
      prisma.marketingCampaign.findMany.mockResolvedValue([{ channel: "trade_show", spend: 1000 }]);

      const result = await service.roiByChannel(COMPANY_A);

      expect(result[0].costPerLead).toBe(500);
      expect(result[0].costPerWonDeal).toBe(1000);
    });

    it("returns null cost figures when a channel has no tracked campaign spend", async () => {
      prisma.client.findMany.mockResolvedValue([{ id: "c1", stage: "lead", estimatedValue: 0, source: "referral", campaign: null }]);
      prisma.marketingCampaign.findMany.mockResolvedValue([]);

      const result = await service.roiByChannel(COMPANY_A);

      expect(result[0].channel).toBe("referral");
      expect(result[0].spend).toBeNull();
      expect(result[0].costPerLead).toBeNull();
    });

    it("falls back to 'unattributed' when a client has neither a campaign nor a source", async () => {
      prisma.client.findMany.mockResolvedValue([{ id: "c1", stage: "lead", estimatedValue: 0, source: null, campaign: null }]);
      prisma.marketingCampaign.findMany.mockResolvedValue([]);

      const result = await service.roiByChannel(COMPANY_A);

      expect(result[0].channel).toBe("unattributed");
    });

    it("sums spend across multiple campaigns that share the same channel", async () => {
      prisma.client.findMany.mockResolvedValue([{ id: "c1", stage: "lead", estimatedValue: 0, source: null, campaign: { channel: "google_ads" } }]);
      prisma.marketingCampaign.findMany.mockResolvedValue([
        { channel: "google_ads", spend: 300 },
        { channel: "google_ads", spend: 200 },
      ]);

      const result = await service.roiByChannel(COMPANY_A);

      expect(result[0].spend).toBe(500);
    });
  });
});
