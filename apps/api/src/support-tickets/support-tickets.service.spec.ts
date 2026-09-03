import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SupportTicketsService } from "./support-tickets.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("SupportTicketsService", () => {
  let service: SupportTicketsService;
  let prisma: {
    supportTicket: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    ticketMessage: { findMany: jest.Mock; create: jest.Mock };
    slaPolicy: { findUnique: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
    project: { findFirst: jest.Mock };
    client: { findFirst: jest.Mock; findUniqueOrThrow: jest.Mock };
    membership: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      supportTicket: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      ticketMessage: { findMany: jest.fn(), create: jest.fn() },
      slaPolicy: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
      project: { findFirst: jest.fn() },
      client: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
      membership: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        SupportTicketsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(SupportTicketsService);
  });

  describe("create()", () => {
    it("rejects a ticket for a client that doesn't belong to the company", async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { name: "Staff" }, { requesterClientId: "c1", requesterName: "Jane", subject: "Help" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("stamps SLA deadlines from the matching policy", async () => {
      prisma.slaPolicy.findUnique.mockResolvedValue({ responseMinutes: 60, resolutionMinutes: 1440 });
      prisma.supportTicket.create.mockResolvedValue({
        id: "t1",
        status: "open",
        firstRespondedAt: null,
        slaResponseDueAt: new Date(),
        slaResolutionDueAt: new Date(),
      });

      await service.create(COMPANY_A, { name: "Staff" }, { requesterName: "Jane", subject: "Help", priority: "high" });

      expect(prisma.slaPolicy.findUnique).toHaveBeenCalledWith({ where: { companyId_priority: { companyId: COMPANY_A, priority: "high" } } });
      const call = prisma.supportTicket.create.mock.calls[0][0];
      expect(call.data.slaResponseDueAt).toBeInstanceOf(Date);
    });

    it("creates a ticket with no SLA deadlines when no policy is configured", async () => {
      prisma.slaPolicy.findUnique.mockResolvedValue(null);
      prisma.supportTicket.create.mockResolvedValue({ id: "t1", status: "open", firstRespondedAt: null, slaResponseDueAt: null, slaResolutionDueAt: null });

      await service.create(COMPANY_A, { name: "Staff" }, { requesterName: "Jane", subject: "Help" });

      const call = prisma.supportTicket.create.mock.calls[0][0];
      expect(call.data.slaResponseDueAt).toBeNull();
    });
  });

  describe("addMessage()", () => {
    it("stamps firstRespondedAt on the first non-internal reply", async () => {
      prisma.supportTicket.findFirst.mockResolvedValue({ id: "t1", status: "open" });
      prisma.ticketMessage.create.mockResolvedValue({ id: "m1" });

      await service.addMessage(COMPANY_A, { name: "Staff" }, "t1", { content: "On it" });

      expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith({ where: { id: "t1", firstRespondedAt: null }, data: { firstRespondedAt: expect.any(Date) } });
    });

    it("does not touch firstRespondedAt for an internal note", async () => {
      prisma.supportTicket.findFirst.mockResolvedValue({ id: "t1", status: "open" });
      prisma.ticketMessage.create.mockResolvedValue({ id: "m1" });

      await service.addMessage(COMPANY_A, { name: "Staff" }, "t1", { content: "internal note", isInternal: true });

      expect(prisma.supportTicket.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("updateStatus()", () => {
    it("stamps resolvedAt when moving to resolved", async () => {
      prisma.supportTicket.findFirst.mockResolvedValue({ id: "t1", subject: "Help", status: "open" });
      prisma.supportTicket.update.mockResolvedValue({
        id: "t1",
        status: "resolved",
        firstRespondedAt: null,
        slaResponseDueAt: null,
        slaResolutionDueAt: null,
      });

      await service.updateStatus(COMPANY_A, { name: "Staff" }, "t1", { status: "resolved" });

      const call = prisma.supportTicket.update.mock.calls[0][0];
      expect(call.data.resolvedAt).toBeInstanceOf(Date);
    });
  });

  describe("assign()", () => {
    it("rejects assigning to a user outside the company", async () => {
      prisma.supportTicket.findFirst.mockResolvedValue({ id: "t1", subject: "Help" });
      prisma.membership.findFirst.mockResolvedValue(null);

      await expect(service.assign(COMPANY_A, { name: "Staff" }, "t1", { userId: "u1" })).rejects.toThrow();
    });
  });

  describe("createForClient()", () => {
    it("creates a ticket and its first message from the portal client's own name", async () => {
      prisma.client.findUniqueOrThrow.mockResolvedValue({ name: "Jane", email: "jane@example.com" });
      prisma.slaPolicy.findUnique.mockResolvedValue(null);
      prisma.supportTicket.create.mockResolvedValue({
        id: "t1",
        status: "open",
        firstRespondedAt: null,
        slaResponseDueAt: null,
        slaResolutionDueAt: null,
      });

      await service.createForClient({ clientId: "c1", companyId: COMPANY_A }, { subject: "Leaky roof", content: "Water coming in" });

      const ticketCall = prisma.supportTicket.create.mock.calls[0][0];
      expect(ticketCall.data.requesterName).toBe("Jane");
      const messageCall = prisma.ticketMessage.create.mock.calls[0][0];
      expect(messageCall.data.authorName).toBe("Jane");
      expect(messageCall.data.content).toBe("Water coming in");
    });
  });
});
