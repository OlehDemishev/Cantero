import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ClientsService } from "./clients.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { OutboxService } from "../common/webhooks/outbox.service";
import { ProjectsService } from "../projects/projects.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("ClientsService", () => {
  let service: ClientsService;
  let prisma: {
    client: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    worker: { findFirst: jest.Mock };
    clientStageHistory: { create: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let outbox: { enqueue: jest.Mock };
  let projects: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      worker: { findFirst: jest.fn() },
      clientStageHistory: { create: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    audit = { record: jest.fn() };
    outbox = { enqueue: jest.fn() };
    projects = { create: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OutboxService, useValue: outbox },
        { provide: ProjectsService, useValue: projects },
      ],
    }).compile();

    service = module.get(ClientsService);
  });

  describe("create()", () => {
    it("rejects when the owner worker does not belong to this company", async () => {
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(service.create(COMPANY_A, { name: "Acme Co", ownerWorkerId: "worker-1" })).rejects.toThrow(BadRequestException);
      expect(prisma.client.create).not.toHaveBeenCalled();
    });

    it("rejects a referredByClientId that does not belong to this company", async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { name: "Acme Co", referredByClientId: "other-client" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.client.create).not.toHaveBeenCalled();
    });

    it("creates with a valid referredByClientId", async () => {
      prisma.client.findFirst.mockResolvedValue({ id: "referrer-1", companyId: COMPANY_A });
      prisma.client.create.mockResolvedValue({ id: "c-2" });

      await service.create(COMPANY_A, { name: "Acme Co", referredByClientId: "referrer-1" });

      expect(prisma.client.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ referredByClientId: "referrer-1" }) }),
      );
    });
  });

  describe("update() — referrals", () => {
    it("rejects a client referring itself", async () => {
      prisma.client.findFirst.mockResolvedValue({ id: "c-1", companyId: COMPANY_A });

      await expect(service.update(COMPANY_A, "c-1", { referredByClientId: "c-1" })).rejects.toThrow(BadRequestException);
      expect(prisma.client.update).not.toHaveBeenCalled();
    });
  });

  describe("moveStage()", () => {
    it("rejects moving to the same stage the client is already in", async () => {
      prisma.client.findFirst.mockResolvedValue({ id: "c-1", companyId: COMPANY_A, name: "Acme Co", stage: "lead" });

      await expect(service.moveStage(COMPANY_A, ACTOR, "c-1", { stage: "lead" })).rejects.toThrow(BadRequestException);
      expect(prisma.client.update).not.toHaveBeenCalled();
    });

    it("sets wonAt and triggers the client.won webhook when moved to won", async () => {
      prisma.client.findFirst.mockResolvedValue({ id: "c-1", companyId: COMPANY_A, name: "Acme Co", stage: "qualified" });
      prisma.client.update.mockResolvedValue({ id: "c-1", stage: "won" });

      await service.moveStage(COMPANY_A, ACTOR, "c-1", { stage: "won" });

      expect(prisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stage: "won", wonAt: expect.any(Date), lostAt: null, lostReason: null }),
        }),
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(prisma, COMPANY_A, "client.won", expect.objectContaining({ clientId: "c-1" }));
    });

    it("sets lostAt/lostReason and triggers the client.lost webhook when moved to lost", async () => {
      prisma.client.findFirst.mockResolvedValue({ id: "c-1", companyId: COMPANY_A, name: "Acme Co", stage: "qualified" });
      prisma.client.update.mockResolvedValue({ id: "c-1", stage: "lost" });

      await service.moveStage(COMPANY_A, ACTOR, "c-1", { stage: "lost", lostReason: "Went with a competitor" });

      expect(prisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stage: "lost", lostAt: expect.any(Date), lostReason: "Went with a competitor", wonAt: null }),
        }),
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(prisma, COMPANY_A, "client.lost", expect.objectContaining({ clientId: "c-1" }));
    });

    it("clears wonAt/lostAt/lostReason when a won client is reopened to another stage", async () => {
      prisma.client.findFirst.mockResolvedValue({ id: "c-1", companyId: COMPANY_A, name: "Acme Co", stage: "won" });
      prisma.client.update.mockResolvedValue({ id: "c-1", stage: "contacted" });

      await service.moveStage(COMPANY_A, ACTOR, "c-1", { stage: "contacted" });

      expect(prisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ wonAt: null, lostAt: null, lostReason: null }) }),
      );
    });
  });

  describe("convertToProject()", () => {
    it("rejects converting a client that isn't won", async () => {
      prisma.client.findFirst.mockResolvedValue({ id: "c-1", companyId: COMPANY_A, name: "Acme Co", stage: "qualified" });

      await expect(service.convertToProject(COMPANY_A, ACTOR, "c-1", { name: "Acme HQ renovation" })).rejects.toThrow(
        BadRequestException,
      );
      expect(projects.create).not.toHaveBeenCalled();
    });

    it("creates a project linked to the client when won", async () => {
      prisma.client.findFirst.mockResolvedValue({ id: "c-1", companyId: COMPANY_A, name: "Acme Co", stage: "won" });
      projects.create.mockResolvedValue({ id: "p-1", name: "Acme HQ renovation" });

      await service.convertToProject(COMPANY_A, ACTOR, "c-1", { name: "Acme HQ renovation" });

      expect(projects.create).toHaveBeenCalledWith(COMPANY_A, { name: "Acme HQ renovation", address: undefined, clientId: "c-1" });
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("pipelineSummary()", () => {
    it("counts clients and sums estimated value per stage, including empty stages", async () => {
      prisma.client.findMany.mockResolvedValue([
        { stage: "lead", estimatedValue: 1000 },
        { stage: "lead", estimatedValue: 500 },
        { stage: "won", estimatedValue: null },
      ]);

      const result = await service.pipelineSummary(COMPANY_A);

      expect(result).toEqual([
        { stage: "lead", count: 2, totalValue: 1500 },
        { stage: "contacted", count: 0, totalValue: 0 },
        { stage: "qualified", count: 0, totalValue: 0 },
        { stage: "won", count: 1, totalValue: 0 },
        { stage: "lost", count: 0, totalValue: 0 },
      ]);
    });
  });

  describe("pipelineForecast()", () => {
    it("falls back to the stage's default probability when none is set manually", async () => {
      prisma.client.findMany.mockResolvedValue([
        { id: "c-1", name: "Acme Co", stage: "qualified", estimatedValue: 1000, probability: null, expectedCloseDate: null },
      ]);

      const result = await service.pipelineForecast(COMPANY_A);

      // qualified's default is 60%
      expect(result.deals[0].probability).toBe(60);
      expect(result.deals[0].weightedValue).toBe(600);
      expect(result.totalWeightedValue).toBe(600);
    });

    it("uses the manually-set probability over the stage default", async () => {
      prisma.client.findMany.mockResolvedValue([
        { id: "c-1", name: "Acme Co", stage: "lead", estimatedValue: 1000, probability: 90, expectedCloseDate: null },
      ]);

      const result = await service.pipelineForecast(COMPANY_A);

      expect(result.deals[0].weightedValue).toBe(900);
    });

    it("buckets a deal with an expectedCloseDate into its month, and unscheduled ones separately", async () => {
      prisma.client.findMany.mockResolvedValue([
        { id: "c-1", name: "Scheduled", stage: "qualified", estimatedValue: 1000, probability: 50, expectedCloseDate: new Date("2026-09-15") },
        { id: "c-2", name: "Unscheduled", stage: "qualified", estimatedValue: 500, probability: 50, expectedCloseDate: null },
      ]);

      const result = await service.pipelineForecast(COMPANY_A);

      expect(result.byMonth).toEqual([{ month: "2026-09", weightedValue: 500 }]);
      expect(result.unscheduledWeightedValue).toBe(250);
    });
  });

  describe("funnelReport()", () => {
    it("computes win rate from won vs. lost counts, ignoring still-open clients", async () => {
      prisma.client.findMany.mockResolvedValue([
        { id: "c-1", stage: "won" },
        { id: "c-2", stage: "won" },
        { id: "c-3", stage: "lost" },
        { id: "c-4", stage: "lead" },
      ]);
      prisma.clientStageHistory.findMany.mockResolvedValue([]);

      const result = await service.funnelReport(COMPANY_A);

      expect(result.wonCount).toBe(2);
      expect(result.lostCount).toBe(1);
      expect(result.winRatePercent).toBeCloseTo((2 / 3) * 100);
    });

    it("returns null win rate when no client has ever been decided", async () => {
      prisma.client.findMany.mockResolvedValue([{ id: "c-1", stage: "lead" }]);
      prisma.clientStageHistory.findMany.mockResolvedValue([]);

      const result = await service.funnelReport(COMPANY_A);

      expect(result.winRatePercent).toBeNull();
    });

    it("counts how many distinct clients ever reached each stage", async () => {
      prisma.client.findMany.mockResolvedValue([{ id: "c-1", stage: "won" }]);
      prisma.clientStageHistory.findMany.mockResolvedValue([
        { clientId: "c-1", fromStage: null, toStage: "lead", changedAt: new Date("2026-01-01") },
        { clientId: "c-1", fromStage: "lead", toStage: "contacted", changedAt: new Date("2026-01-05") },
        { clientId: "c-1", fromStage: "contacted", toStage: "won", changedAt: new Date("2026-01-10") },
      ]);

      const result = await service.funnelReport(COMPANY_A);
      const byStage = Object.fromEntries(result.funnel.map((f) => [f.stage, f]));

      expect(byStage.lead.everReachedCount).toBe(1);
      expect(byStage.contacted.everReachedCount).toBe(1);
      expect(byStage.qualified.everReachedCount).toBe(0);
      // 4 days in "lead" before moving to "contacted"
      expect(byStage.lead.avgDaysInStage).toBeCloseTo(4);
    });
  });

  describe("ownerLeaderboard()", () => {
    it("splits each owner's clients into open vs. won, ignoring lost and unowned deals", async () => {
      prisma.client.findMany.mockResolvedValue([
        { ownerWorkerId: "w-1", owner: { name: "Alex" }, stage: "won", estimatedValue: 5000 },
        { ownerWorkerId: "w-1", owner: { name: "Alex" }, stage: "qualified", estimatedValue: 2000 },
        { ownerWorkerId: "w-1", owner: { name: "Alex" }, stage: "lost", estimatedValue: 3000 },
      ]);

      const result = await service.ownerLeaderboard(COMPANY_A);

      expect(result).toEqual([
        { ownerWorkerId: "w-1", ownerName: "Alex", openCount: 1, openValue: 2000, wonCount: 1, wonValue: 5000 },
      ]);
    });

    it("ranks owners by won value, highest first", async () => {
      prisma.client.findMany.mockResolvedValue([
        { ownerWorkerId: "w-1", owner: { name: "Low" }, stage: "won", estimatedValue: 1000 },
        { ownerWorkerId: "w-2", owner: { name: "High" }, stage: "won", estimatedValue: 9000 },
      ]);

      const result = await service.ownerLeaderboard(COMPANY_A);

      expect(result.map((r) => r.ownerName)).toEqual(["High", "Low"]);
    });
  });
});
