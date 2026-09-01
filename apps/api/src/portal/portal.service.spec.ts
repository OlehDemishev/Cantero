import { Test } from "@nestjs/testing";
import { PortalService } from "./portal.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { EstimatesService } from "../estimates/estimates.service";
import { ChangeOrdersService } from "../estimates/change-orders.service";
import { InvoicesService } from "../finance/invoices.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { BillingService } from "../billing/billing.service";
import { ClientPaymentMethodsService } from "../finance/client-payment-methods.service";

const COMPANY_A = "company-a";
const CLIENT_1 = { companyId: COMPANY_A, clientId: "client-1" };

describe("PortalService.listProjects — progress", () => {
  let service: PortalService;
  let prisma: {
    project: { findMany: jest.Mock };
    task: { groupBy: jest.Mock };
    estimate: { aggregate: jest.Mock };
    invoice: { aggregate: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findMany: jest.fn() },
      task: { groupBy: jest.fn() },
      estimate: { aggregate: jest.fn() },
      invoice: { aggregate: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        PortalService,
        { provide: PrismaService, useValue: prisma },
        { provide: EstimatesService, useValue: {} },
        { provide: ChangeOrdersService, useValue: {} },
        { provide: InvoicesService, useValue: {} },
        { provide: WebhooksService, useValue: {} },
        { provide: BillingService, useValue: {} },
        { provide: ClientPaymentMethodsService, useValue: {} },
      ],
    }).compile();

    service = module.get(PortalService);
  });

  it("returns null percentages when there are no tasks and no approved estimate", async () => {
    prisma.project.findMany.mockResolvedValue([{ id: "p1", name: "Reno", handoverDate: null, warrantyMonths: null }]);
    prisma.task.groupBy.mockResolvedValue([]);
    prisma.estimate.aggregate.mockResolvedValue({ _sum: { grandTotal: null } });
    prisma.invoice.aggregate.mockResolvedValue({ _sum: { total: null } });

    const result = await service.listProjects(CLIENT_1);

    expect(result[0].progress).toEqual({ tasksTotal: 0, tasksDone: 0, taskPercent: null, budgetPercent: null });
  });

  it("computes task completion percent from grouped task counts", async () => {
    prisma.project.findMany.mockResolvedValue([{ id: "p1", name: "Reno", handoverDate: null, warrantyMonths: null }]);
    prisma.task.groupBy.mockResolvedValue([
      { status: "done", _count: 3 },
      { status: "in_progress", _count: 1 },
      { status: "planned", _count: 1 },
    ]);
    prisma.estimate.aggregate.mockResolvedValue({ _sum: { grandTotal: null } });
    prisma.invoice.aggregate.mockResolvedValue({ _sum: { total: null } });

    const result = await service.listProjects(CLIENT_1);

    expect(result[0].progress.tasksTotal).toBe(5);
    expect(result[0].progress.tasksDone).toBe(3);
    expect(result[0].progress.taskPercent).toBe(60);
  });

  it("computes budget percent from paid invoices against the approved estimate's grandTotal", async () => {
    prisma.project.findMany.mockResolvedValue([{ id: "p1", name: "Reno", handoverDate: null, warrantyMonths: null }]);
    prisma.task.groupBy.mockResolvedValue([]);
    prisma.estimate.aggregate.mockResolvedValue({ _sum: { grandTotal: "10000.00" } });
    prisma.invoice.aggregate.mockResolvedValue({ _sum: { total: "2500.00" } });

    const result = await service.listProjects(CLIENT_1);

    expect(result[0].progress.budgetPercent).toBe(25);
  });
});
