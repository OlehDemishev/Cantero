import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { ChangeOrderRemindersService } from "./change-order-reminders.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { ChangeOrdersService } from "../estimates/change-orders.service";
import { CHANGE_ORDER_REMINDERS_QUEUE } from "../common/queue/queue.module";

const COMPANY_A = "company-a";
const DAY_MS = 24 * 60 * 60 * 1000;

function changeOrderSentDaysAgo(days: number, overrides: Record<string, unknown> = {}) {
  return {
    id: "co-1",
    title: "Add a bay window",
    clientDecision: "pending",
    sentAt: new Date(Date.now() - days * DAY_MS),
    reminderCount: 0,
    clientAccessToken: "token-123",
    estimate: { project: { client: { email: "client@example.com" } } },
    ...overrides,
  };
}

describe("ChangeOrderRemindersService", () => {
  let service: ChangeOrderRemindersService;
  let prisma: {
    company: { findMany: jest.Mock };
    changeOrder: { findMany: jest.Mock; update: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let changeOrders: { generatePdf: jest.Mock };

  beforeEach(async () => {
    prisma = {
      company: { findMany: jest.fn() },
      changeOrder: { findMany: jest.fn(), update: jest.fn() },
    };
    mail = { send: jest.fn() };
    changeOrders = { generatePdf: jest.fn().mockResolvedValue(Buffer.from("PDF")) };

    const module = await Test.createTestingModule({
      providers: [
        ChangeOrderRemindersService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ChangeOrdersService, useValue: changeOrders },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: getQueueToken(CHANGE_ORDER_REMINDERS_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(ChangeOrderRemindersService);
  });

  it("skips companies with change order reminders disabled", async () => {
    prisma.company.findMany.mockResolvedValue([]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(prisma.changeOrder.findMany).not.toHaveBeenCalled();
  });

  it("does not send before the next threshold is reached", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.changeOrder.findMany.mockResolvedValue([changeOrderSentDaysAgo(2)]); // first threshold is 3 days

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.changeOrder.update).not.toHaveBeenCalled();
  });

  it("sends the first reminder once 3+ days pending and advances reminderCount", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.changeOrder.findMany.mockResolvedValue([changeOrderSentDaysAgo(3)]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].to).toBe("client@example.com");
    expect(mail.send.mock.calls[0][0].text).toContain("token-123");
    expect(prisma.changeOrder.update).toHaveBeenCalledWith({
      where: { id: "co-1" },
      data: { reminderCount: 1, lastReminderSentAt: expect.any(Date) },
    });
  });

  it("escalates tone on the final (3rd) reminder past 14 days", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.changeOrder.findMany.mockResolvedValue([changeOrderSentDaysAgo(15, { reminderCount: 2 })]);

    await service.runDuePass();

    expect(mail.send.mock.calls[0][0].subject).toContain("Last reminder");
    expect(prisma.changeOrder.update).toHaveBeenCalledWith({
      where: { id: "co-1" },
      data: { reminderCount: 3, lastReminderSentAt: expect.any(Date) },
    });
  });

  it("skips a change order with no client email rather than crashing the pass", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.changeOrder.findMany.mockResolvedValue([
      changeOrderSentDaysAgo(5, { estimate: { project: { client: { email: null } } } }),
    ]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("skips a change order whose estimate has no project at all", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.changeOrder.findMany.mockResolvedValue([changeOrderSentDaysAgo(5, { estimate: { project: null } })]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("still sends the reminder even when PDF generation fails", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.changeOrder.findMany.mockResolvedValue([changeOrderSentDaysAgo(3)]);
    changeOrders.generatePdf.mockRejectedValue(new Error("pdf broke"));

    const result = await service.runDuePass();

    expect(result.sent).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].attachments).toBeUndefined();
  });

  it("filters the query to sent, pending, and under the reminder cap", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.changeOrder.findMany.mockResolvedValue([]);

    await service.runDuePass();

    const queryArg = prisma.changeOrder.findMany.mock.calls[0][0];
    expect(queryArg.where.sentAt).toEqual({ not: null });
    expect(queryArg.where.clientDecision).toBe("pending");
    expect(queryArg.where.reminderCount).toEqual({ lt: 3 });
  });
});
