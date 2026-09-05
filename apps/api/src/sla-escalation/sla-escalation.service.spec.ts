import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { SlaEscalationService } from "./sla-escalation.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { SLA_ESCALATION_QUEUE } from "../common/queue/queue.module";

const COMPANY_A = "company-a";

describe("SlaEscalationService", () => {
  let service: SlaEscalationService;
  let prisma: {
    company: { findMany: jest.Mock };
    rfi: { findMany: jest.Mock; updateMany: jest.Mock };
    punchListItem: { findMany: jest.Mock; updateMany: jest.Mock };
    submittal: { findMany: jest.Mock; updateMany: jest.Mock };
    membership: { findMany: jest.Mock };
  };
  let mail: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      company: { findMany: jest.fn() },
      rfi: { findMany: jest.fn(), updateMany: jest.fn() },
      punchListItem: { findMany: jest.fn(), updateMany: jest.fn() },
      submittal: { findMany: jest.fn(), updateMany: jest.fn() },
      membership: { findMany: jest.fn().mockResolvedValue([{ user: { email: "owner@example.com" } }]) },
    };
    mail = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SlaEscalationService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: getQueueToken(SLA_ESCALATION_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(SlaEscalationService);
  });

  describe("runDuePass()", () => {
    it("skips companies with no SLA configured", async () => {
      prisma.company.findMany.mockResolvedValue([]);

      const result = await service.runDuePass();

      expect(result.escalated).toBe(0);
      expect(prisma.rfi.findMany).not.toHaveBeenCalled();
    });

    it("escalates an overdue open RFI, flags it, and emails the owner", async () => {
      prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme", rfiSlaDays: 5, punchListSlaDays: null }]);
      prisma.rfi.findMany.mockResolvedValue([{ id: "rfi-1", number: "RFI-001", subject: "Ceiling height", projectId: "proj-1" }]);
      prisma.punchListItem.findMany.mockResolvedValue([]);

      const result = await service.runDuePass();

      expect(result.escalated).toBe(1);
      expect(prisma.rfi.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["rfi-1"] } },
        data: { escalatedAt: expect.any(Date) },
      });
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(mail.send.mock.calls[0][0].to).toBe("owner@example.com");
      expect(mail.send.mock.calls[0][0].subject).toContain("RFI ");
    });

    it("does not re-escalate items that are already escalated, since the query excludes them", async () => {
      prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme", rfiSlaDays: 5, punchListSlaDays: null }]);
      prisma.rfi.findMany.mockResolvedValue([]);
      prisma.punchListItem.findMany.mockResolvedValue([]);

      const result = await service.runDuePass();

      expect(result.escalated).toBe(0);
      expect(prisma.rfi.updateMany).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
      const queryArg = prisma.rfi.findMany.mock.calls[0][0];
      expect(queryArg.where.escalatedAt).toBeNull();
      expect(queryArg.where.status).toBe("open");
    });

    it("skips submittal escalation for a company with the flag off, even if it has an RFI/punch-list SLA configured", async () => {
      prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme", rfiSlaDays: null, punchListSlaDays: null, submittalEscalationEnabled: false }]);
      prisma.rfi.findMany.mockResolvedValue([]);
      prisma.punchListItem.findMany.mockResolvedValue([]);

      const result = await service.runDuePass();

      expect(result.escalated).toBe(0);
      expect(prisma.submittal.findMany).not.toHaveBeenCalled();
    });

    it("escalates a submittal past its own dueDate, flags it, and emails the owner", async () => {
      prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme", rfiSlaDays: null, punchListSlaDays: null, submittalEscalationEnabled: true }]);
      prisma.rfi.findMany.mockResolvedValue([]);
      prisma.punchListItem.findMany.mockResolvedValue([]);
      prisma.submittal.findMany.mockResolvedValue([{ id: "sub-1", number: "SUB-001", title: "Structural steel shop drawings", projectId: "proj-1" }]);

      const result = await service.runDuePass();

      expect(result.escalated).toBe(1);
      expect(prisma.submittal.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["sub-1"] } },
        data: { escalatedAt: expect.any(Date) },
      });
      const queryArg = prisma.submittal.findMany.mock.calls[0][0];
      expect(queryArg.where.status).toBe("submitted");
      expect(queryArg.where.escalatedAt).toBeNull();
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(mail.send.mock.calls[0][0].subject).toContain("Submittal overdue");
    });
  });
});
