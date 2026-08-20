import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RecurringInvoicesService } from "./recurring-invoices.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { RECURRING_INVOICES_QUEUE } from "../common/queue/queue.module";
import { getQueueToken } from "@nestjs/bullmq";

const COMPANY_A = "company-a";

describe("RecurringInvoicesService", () => {
  let service: RecurringInvoicesService;
  let prisma: {
    project: { findFirst: jest.Mock };
    client: { findFirst: jest.Mock };
    recurringInvoice: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock; findMany: jest.Mock };
    recurringInvoiceLine: { deleteMany: jest.Mock; createMany: jest.Mock };
    invoice: { count: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      client: { findFirst: jest.fn() },
      recurringInvoice: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
      recurringInvoiceLine: { deleteMany: jest.fn(), createMany: jest.fn() },
      invoice: { count: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };

    const module = await Test.createTestingModule({
      providers: [
        RecurringInvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn(), list: jest.fn() } },
        { provide: WebhooksService, useValue: { trigger: jest.fn() } },
        { provide: getQueueToken(RECURRING_INVOICES_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(RecurringInvoicesService);
  });

  describe("create()", () => {
    it("rejects a projectId that belongs to another company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { name: "Owner" }, {
          projectId: "foreign-project",
          clientId: "client-1",
          name: "Monthly retainer",
          frequency: "monthly",
          taxPercent: 0,
          startDate: "2026-01-01T00:00:00.000Z",
          lines: [{ description: "Retainer", quantity: 1, unitPrice: 1000 }],
        }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.recurringInvoice.create).not.toHaveBeenCalled();
    });

    it("rejects a clientId that belongs to another company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { name: "Owner" }, {
          projectId: "project-1",
          clientId: "foreign-client",
          name: "Monthly retainer",
          frequency: "monthly",
          taxPercent: 0,
          startDate: "2026-01-01T00:00:00.000Z",
          lines: [{ description: "Retainer", quantity: 1, unitPrice: 1000 }],
        }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.recurringInvoice.create).not.toHaveBeenCalled();
    });

    it("sets nextRunDate to startDate on creation", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.client.findFirst.mockResolvedValue({ id: "client-1", companyId: COMPANY_A });
      prisma.recurringInvoice.create.mockResolvedValue({ id: "rec-1", lines: [] });

      await service.create(COMPANY_A, { name: "Owner" }, {
        projectId: "project-1",
        clientId: "client-1",
        name: "Monthly retainer",
        frequency: "monthly",
        taxPercent: 0,
        startDate: "2026-03-01T00:00:00.000Z",
        lines: [{ description: "Retainer", quantity: 1, unitPrice: 1000 }],
      });

      expect(prisma.recurringInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startDate: new Date("2026-03-01T00:00:00.000Z"),
            nextRunDate: new Date("2026-03-01T00:00:00.000Z"),
          }),
        }),
      );
    });
  });

  describe("get()", () => {
    it("rejects a recurring invoice that belongs to another company", async () => {
      prisma.recurringInvoice.findFirst.mockResolvedValue(null);
      await expect(service.get(COMPANY_A, "rec-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("runDuePass()", () => {
    it("deactivates a template whose nextRunDate is past its endDate instead of generating", async () => {
      prisma.recurringInvoice.findMany.mockResolvedValue([
        {
          id: "rec-1",
          companyId: COMPANY_A,
          nextRunDate: new Date("2026-06-01T00:00:00.000Z"),
          endDate: new Date("2026-05-01T00:00:00.000Z"),
          lines: [],
        },
      ]);

      const result = await service.runDuePass();

      expect(prisma.recurringInvoice.update).toHaveBeenCalledWith({ where: { id: "rec-1" }, data: { active: false } });
      expect(prisma.invoice.create).not.toHaveBeenCalled();
      expect(result).toEqual({ generated: 0 });
    });

    it("generates an invoice for a due template with no endDate", async () => {
      prisma.recurringInvoice.findMany.mockResolvedValue([
        {
          id: "rec-1",
          companyId: COMPANY_A,
          projectId: "project-1",
          clientId: "client-1",
          frequency: "monthly",
          taxPercent: 0,
          nextRunDate: new Date("2026-06-01T00:00:00.000Z"),
          endDate: null,
          lines: [{ description: "Retainer", quantity: 1, unitPrice: 1000 }],
        },
      ]);
      prisma.invoice.count.mockResolvedValue(0);
      prisma.invoice.create.mockResolvedValue({ id: "inv-1", number: "INV-0001" });

      const result = await service.runDuePass();

      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recurringInvoiceId: "rec-1", status: "draft", total: 1000 }),
        }),
      );
      expect(result).toEqual({ generated: 1 });
    });
  });
});
