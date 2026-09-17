import { Test } from "@nestjs/testing";
import { PortalService } from "./portal.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { EstimatesService } from "../estimates/estimates.service";
import { ChangeOrdersService } from "../estimates/change-orders.service";
import { InvoicesService } from "../finance/invoices.service";
import { OutboxService } from "../common/webhooks/outbox.service";
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
        { provide: OutboxService, useValue: {} },
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

describe("PortalService.me() — payment method label", () => {
  let service: PortalService;
  let prisma: { client: { findUniqueOrThrow: jest.Mock } };

  beforeEach(async () => {
    prisma = { client: { findUniqueOrThrow: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [
        PortalService,
        { provide: PrismaService, useValue: prisma },
        { provide: EstimatesService, useValue: {} },
        { provide: ChangeOrdersService, useValue: {} },
        { provide: InvoicesService, useValue: {} },
        { provide: OutboxService, useValue: {} },
        { provide: BillingService, useValue: {} },
        { provide: ClientPaymentMethodsService, useValue: {} },
      ],
    }).compile();

    service = module.get(PortalService);
  });

  function mockClient(overrides: Partial<{ stripePaymentMethodType: string | null; stripePaymentMethodBrand: string | null; stripePaymentMethodLast4: string | null }>) {
    prisma.client.findUniqueOrThrow.mockResolvedValue({
      name: "Acme",
      email: "acme@example.com",
      company: { name: "Cantero Demo", currency: "EUR" },
      stripePaymentMethodType: null,
      stripePaymentMethodBrand: null,
      stripePaymentMethodLast4: null,
      ...overrides,
    });
  }

  it("labels a card by its brand", async () => {
    mockClient({ stripePaymentMethodType: "card", stripePaymentMethodBrand: "visa", stripePaymentMethodLast4: "4242" });
    const result = await service.me(CLIENT_1);
    expect(result.savedPaymentMethodLabel).toBe("visa");
  });

  it("labels a legacy card row (saved before stripePaymentMethodType existed) by its brand too", async () => {
    mockClient({ stripePaymentMethodType: null, stripePaymentMethodBrand: "mastercard", stripePaymentMethodLast4: "1111" });
    const result = await service.me(CLIENT_1);
    expect(result.savedPaymentMethodLabel).toBe("mastercard");
  });

  it("labels a SEPA Direct Debit payment method generically, not by brand", async () => {
    mockClient({ stripePaymentMethodType: "sepa_debit", stripePaymentMethodBrand: null, stripePaymentMethodLast4: "3000" });
    const result = await service.me(CLIENT_1);
    expect(result.savedPaymentMethodLabel).toBe("SEPA Direct Debit");
  });

  it("labels a US bank account (ACH) payment method generically, not by brand", async () => {
    mockClient({ stripePaymentMethodType: "us_bank_account", stripePaymentMethodBrand: null, stripePaymentMethodLast4: "6789" });
    const result = await service.me(CLIENT_1);
    expect(result.savedPaymentMethodLabel).toBe("Bank account");
  });

  it("returns null when nothing is saved", async () => {
    mockClient({});
    const result = await service.me(CLIENT_1);
    expect(result.savedPaymentMethodLabel).toBeNull();
    expect(result.savedPaymentMethodLast4).toBeNull();
  });
});

describe("PortalService — change requests", () => {
  let service: PortalService;
  let prisma: {
    project: { findFirst: jest.Mock };
    client: { findUniqueOrThrow: jest.Mock };
    clientChangeRequest: { findMany: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let outbox: { enqueue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      client: { findUniqueOrThrow: jest.fn() },
      clientChangeRequest: { findMany: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    outbox = { enqueue: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PortalService,
        { provide: PrismaService, useValue: prisma },
        { provide: EstimatesService, useValue: {} },
        { provide: ChangeOrdersService, useValue: {} },
        { provide: InvoicesService, useValue: {} },
        { provide: OutboxService, useValue: outbox },
        { provide: BillingService, useValue: {} },
        { provide: ClientPaymentMethodsService, useValue: {} },
      ],
    }).compile();

    service = module.get(PortalService);
  });

  describe("createChangeRequest()", () => {
    it("rejects a request for a project that isn't this client's own", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.createChangeRequest(CLIENT_1, { projectId: "p1", title: "Add a deck", description: "We'd like a rear deck added" }),
      ).rejects.toThrow("Project not found");
    });

    it("creates a request and fires a webhook", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Reno" });
      prisma.client.findUniqueOrThrow.mockResolvedValue({ id: "client-1", name: "Jane Homeowner" });
      prisma.clientChangeRequest.create.mockResolvedValue({ id: "ccr-1", title: "Add a deck" });

      await service.createChangeRequest(CLIENT_1, { projectId: "p1", title: "Add a deck", description: "We'd like a rear deck added" });

      expect(prisma.clientChangeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ submittedByName: "Jane Homeowner" }) }),
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(prisma, COMPANY_A, "client_change_request.submitted", expect.any(Object));
    });
  });

  describe("listChangeRequests()", () => {
    it("scopes to this client's own requests", async () => {
      prisma.clientChangeRequest.findMany.mockResolvedValue([]);

      await service.listChangeRequests(CLIENT_1);

      expect(prisma.clientChangeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_A, submittedByClientId: "client-1" } }),
      );
    });
  });
});
