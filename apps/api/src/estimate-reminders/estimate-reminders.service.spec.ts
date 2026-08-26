import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { EstimateRemindersService } from "./estimate-reminders.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { EstimatesService } from "../estimates/estimates.service";
import { ESTIMATE_REMINDERS_QUEUE } from "../common/queue/queue.module";

const COMPANY_A = "company-a";
const DAY_MS = 24 * 60 * 60 * 1000;

function estimateSentDaysAgo(days: number, overrides: Record<string, unknown> = {}) {
  return {
    id: "est-1",
    name: "Kitchen remodel",
    clientDecision: "pending",
    sentAt: new Date(Date.now() - days * DAY_MS),
    reminderCount: 0,
    clientAccessToken: "token-123",
    project: { client: { email: "client@example.com" } },
    ...overrides,
  };
}

describe("EstimateRemindersService", () => {
  let service: EstimateRemindersService;
  let prisma: {
    company: { findMany: jest.Mock };
    estimate: { findMany: jest.Mock; update: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let estimates: { generatePdf: jest.Mock };

  beforeEach(async () => {
    prisma = {
      company: { findMany: jest.fn() },
      estimate: { findMany: jest.fn(), update: jest.fn() },
    };
    mail = { send: jest.fn() };
    estimates = { generatePdf: jest.fn().mockResolvedValue(Buffer.from("PDF")) };

    const module = await Test.createTestingModule({
      providers: [
        EstimateRemindersService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: EstimatesService, useValue: estimates },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: getQueueToken(ESTIMATE_REMINDERS_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(EstimateRemindersService);
  });

  it("skips companies with estimate reminders disabled", async () => {
    prisma.company.findMany.mockResolvedValue([]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(prisma.estimate.findMany).not.toHaveBeenCalled();
  });

  it("does not send before the next threshold is reached", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.estimate.findMany.mockResolvedValue([estimateSentDaysAgo(2)]); // first threshold is 3 days

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.estimate.update).not.toHaveBeenCalled();
  });

  it("sends the first reminder once 3+ days pending and advances reminderCount", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.estimate.findMany.mockResolvedValue([estimateSentDaysAgo(3)]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].to).toBe("client@example.com");
    expect(mail.send.mock.calls[0][0].text).toContain("token-123");
    expect(prisma.estimate.update).toHaveBeenCalledWith({
      where: { id: "est-1" },
      data: { reminderCount: 1, lastReminderSentAt: expect.any(Date) },
    });
  });

  it("escalates tone on the final (3rd) reminder past 14 days", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.estimate.findMany.mockResolvedValue([estimateSentDaysAgo(15, { reminderCount: 2 })]);

    await service.runDuePass();

    expect(mail.send.mock.calls[0][0].subject).toContain("Last reminder");
    expect(prisma.estimate.update).toHaveBeenCalledWith({
      where: { id: "est-1" },
      data: { reminderCount: 3, lastReminderSentAt: expect.any(Date) },
    });
  });

  it("skips an estimate with no client email rather than crashing the pass", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.estimate.findMany.mockResolvedValue([estimateSentDaysAgo(5, { project: { client: { email: null } } })]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("still sends the reminder even when PDF generation fails", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.estimate.findMany.mockResolvedValue([estimateSentDaysAgo(3)]);
    estimates.generatePdf.mockRejectedValue(new Error("pdf broke"));

    const result = await service.runDuePass();

    expect(result.sent).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].attachments).toBeUndefined();
  });

  it("filters the query to sent, pending, and under the reminder cap", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.estimate.findMany.mockResolvedValue([]);

    await service.runDuePass();

    const queryArg = prisma.estimate.findMany.mock.calls[0][0];
    expect(queryArg.where.sentAt).toEqual({ not: null });
    expect(queryArg.where.clientDecision).toBe("pending");
    expect(queryArg.where.reminderCount).toEqual({ lt: 3 });
  });
});
