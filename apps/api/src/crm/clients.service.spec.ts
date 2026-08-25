import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ClientsService } from "./clients.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { ProjectsService } from "../projects/projects.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("ClientsService", () => {
  let service: ClientsService;
  let prisma: {
    client: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    worker: { findFirst: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let webhooks: { trigger: jest.Mock };
  let projects: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      worker: { findFirst: jest.fn() },
    };
    audit = { record: jest.fn() };
    webhooks = { trigger: jest.fn() };
    projects = { create: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: WebhooksService, useValue: webhooks },
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
      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "client.won", expect.objectContaining({ clientId: "c-1" }));
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
      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "client.lost", expect.objectContaining({ clientId: "c-1" }));
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
});
