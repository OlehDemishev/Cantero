import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { InvoiceRemindersService } from "./invoice-reminders.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { InvoicesService } from "../finance/invoices.service";
import { INVOICE_REMINDERS_QUEUE } from "../common/queue/queue.module";

const COMPANY_A = "company-a";
const DAY_MS = 24 * 60 * 60 * 1000;

function invoiceOverdueBy(days: number, overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    number: "INV-0001",
    total: "1500.00",
    dueDate: new Date(Date.now() - days * DAY_MS),
    reminderCount: 0,
    client: { email: "client@example.com" },
    payments: [],
    ...overrides,
  };
}

describe("InvoiceRemindersService", () => {
  let service: InvoiceRemindersService;
  let prisma: {
    company: { findMany: jest.Mock };
    invoice: { findMany: jest.Mock; update: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let invoices: { generatePdf: jest.Mock };

  beforeEach(async () => {
    prisma = {
      company: { findMany: jest.fn() },
      invoice: { findMany: jest.fn(), update: jest.fn() },
    };
    mail = { send: jest.fn() };
    invoices = { generatePdf: jest.fn().mockResolvedValue(Buffer.from("PDF")) };

    const module = await Test.createTestingModule({
      providers: [
        InvoiceRemindersService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: InvoicesService, useValue: invoices },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: getQueueToken(INVOICE_REMINDERS_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(InvoiceRemindersService);
  });

  it("skips companies with reminders disabled", async () => {
    prisma.company.findMany.mockResolvedValue([]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("does not send a reminder before the next threshold is reached", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme", currency: "EUR" }]);
    prisma.invoice.findMany.mockResolvedValue([invoiceOverdueBy(2)]); // first threshold is 3 days

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it("sends the first reminder once 3+ days overdue and advances reminderCount", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme", currency: "EUR" }]);
    prisma.invoice.findMany.mockResolvedValue([invoiceOverdueBy(3)]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].to).toBe("client@example.com");
    expect(mail.send.mock.calls[0][0].subject).toContain("INV-0001");
    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { reminderCount: 1, lastReminderSentAt: expect.any(Date) },
    });
  });

  it("escalates tone on the final (4th) reminder past 30 days", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme", currency: "EUR" }]);
    prisma.invoice.findMany.mockResolvedValue([invoiceOverdueBy(31, { reminderCount: 3 })]);

    await service.runDuePass();

    expect(mail.send.mock.calls[0][0].subject).toContain("FINAL NOTICE");
    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { reminderCount: 4, lastReminderSentAt: expect.any(Date) },
    });
  });

  it("skips an invoice with no client email rather than crashing the pass", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme", currency: "EUR" }]);
    prisma.invoice.findMany.mockResolvedValue([invoiceOverdueBy(5, { client: { email: null } })]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("still sends the reminder even when PDF generation fails", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme", currency: "EUR" }]);
    prisma.invoice.findMany.mockResolvedValue([invoiceOverdueBy(3)]);
    invoices.generatePdf.mockRejectedValue(new Error("pdf broke"));

    const result = await service.runDuePass();

    expect(result.sent).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].attachments).toBeUndefined();
  });

  it("quotes the remaining balance, not the original total, when the client has already made a partial payment", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme", currency: "EUR" }]);
    prisma.invoice.findMany.mockResolvedValue([
      invoiceOverdueBy(3, { total: "1500.00", currency: "EUR", payments: [{ amount: "500.00" }] }),
    ]);

    await service.runDuePass();

    const { html, text } = mail.send.mock.calls[0][0];
    expect(html).toContain("Amount due: <strong>1000 EUR</strong>");
    expect(text).toContain("Amount due: 1000 EUR");
  });

  it("excludes an invoice that already received all 4 reminders, via the query filter", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme", currency: "EUR" }]);
    prisma.invoice.findMany.mockResolvedValue([]);

    await service.runDuePass();

    const queryArg = prisma.invoice.findMany.mock.calls[0][0];
    expect(queryArg.where.reminderCount).toEqual({ lt: 4 });
  });
});
