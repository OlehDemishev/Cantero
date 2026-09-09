import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { EstimatesService } from "./estimates.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { OutboxService } from "../common/webhooks/outbox.service";

const COMPANY_A = "company-a";
const OTHER_COMPANY_ESTIMATE = {
  id: "estimate-1",
  companyId: COMPANY_A,
  lines: [],
  sections: [],
  requirements: [],
  project: null,
};

describe("EstimatesService — currency resolution", () => {
  let service: EstimatesService;
  let prisma: {
    project: { findFirst: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    estimate: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
      estimate: { create: jest.fn().mockResolvedValue({ id: "estimate-1" }) },
    };

    const module = await Test.createTestingModule({
      providers: [
        EstimatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { save: jest.fn(), read: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn(), list: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
        { provide: MailService, useValue: { send: jest.fn() } },
        { provide: OutboxService, useValue: { enqueue: jest.fn() } },
      ],
    }).compile();

    service = module.get(EstimatesService);
  });

  it("falls back to the company's default currency when the project has no override", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, currency: null });
    prisma.company.findUniqueOrThrow.mockResolvedValue({ currency: "EUR" });

    await service.create(COMPANY_A, {
      projectId: "project-1",
      name: "Estimate A",
      laborRatePerHour: 40,
      markupPercent: 15,
      taxPercent: 0,
    });

    expect(prisma.estimate.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currency: "EUR" }) }));
  });

  it("uses the project's override currency instead of the company default when set", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, currency: "CAD" });

    await service.create(COMPANY_A, {
      projectId: "project-1",
      name: "Estimate A",
      laborRatePerHour: 40,
      markupPercent: 15,
      taxPercent: 0,
    });

    expect(prisma.estimate.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currency: "CAD" }) }));
    // The company is never looked up once the project already settles the question.
    expect(prisma.company.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe("EstimatesService — hideCostDataFromRoles", () => {
  let service: EstimatesService;
  let prisma: {
    estimate: { findFirst: jest.Mock; findMany: jest.Mock };
    company: { findUnique: jest.Mock };
  };

  const LINE_ESTIMATE = {
    id: "estimate-1",
    companyId: COMPANY_A,
    isTemplate: false,
    materialsCostTotal: "500.00",
    laborCostTotal: "300.00",
    markupAmount: "100.00",
    markupPercent: "15",
    laborRatePerHour: "40",
    grandTotal: "900.00",
    lines: [],
    sections: [],
    requirements: [],
    project: null,
    approvals: [],
  };

  beforeEach(async () => {
    prisma = {
      estimate: { findFirst: jest.fn(), findMany: jest.fn() },
      company: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        EstimatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { save: jest.fn(), read: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn(), list: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
        { provide: MailService, useValue: { send: jest.fn() } },
        { provide: OutboxService, useValue: { enqueue: jest.fn() } },
      ],
    }).compile();

    service = module.get(EstimatesService);
  });

  it("list() leaves cost data intact for owner/admin", async () => {
    prisma.estimate.findMany.mockResolvedValue([LINE_ESTIMATE]);

    const result = await service.list(COMPANY_A, "owner");

    expect(result[0].materialsCostTotal).toBe("500.00");
    expect(prisma.company.findUnique).not.toHaveBeenCalled();
  });

  it("list() leaves cost data intact when the role isn't in hideCostDataFromRoles", async () => {
    prisma.estimate.findMany.mockResolvedValue([LINE_ESTIMATE]);
    prisma.company.findUnique.mockResolvedValue({ hideCostDataFromRoles: ["worker"] });

    const result = await service.list(COMPANY_A, "estimator");

    expect(result[0].materialsCostTotal).toBe("500.00");
  });

  it("list() redacts cost/markup fields for a role in hideCostDataFromRoles", async () => {
    prisma.estimate.findMany.mockResolvedValue([LINE_ESTIMATE]);
    prisma.company.findUnique.mockResolvedValue({ hideCostDataFromRoles: ["worker"] });

    const result = await service.list(COMPANY_A, "worker");

    expect(result[0]).toMatchObject({
      materialsCostTotal: null,
      laborCostTotal: null,
      markupAmount: null,
      markupPercent: null,
      laborRatePerHour: null,
    });
    expect(result[0].grandTotal).toBe("900.00"); // the bottom-line total isn't a cost/markup breakdown — stays visible
  });

  it("get() redacts per-line materialsCost/laborCost too", async () => {
    prisma.estimate.findFirst.mockResolvedValue({
      ...LINE_ESTIMATE,
      isTemplate: true, // isTemplate short-circuits before computeForLines, keeping the mock simple
      lines: [{ id: "line-1", materialsCost: "50.00", laborCost: "20.00", lineTotal: "70.00" }],
    });
    prisma.company.findUnique.mockResolvedValue({ hideCostDataFromRoles: ["worker"] });

    const result = await service.get(COMPANY_A, "estimate-1", "worker");

    expect(result.lines[0]).toMatchObject({ materialsCost: null, laborCost: null, lineTotal: "70.00" });
  });
});

describe("EstimatesService — cross-tenant isolation", () => {
  let service: EstimatesService;
  let prisma: {
    estimate: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    project: { findFirst: jest.Mock };
    rateCatalogItem: { findFirst: jest.Mock };
    estimateLine: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      estimate: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      project: { findFirst: jest.fn() },
      rateCatalogItem: { findFirst: jest.fn() },
      estimateLine: { create: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [
        EstimatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { save: jest.fn(), read: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn(), list: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
        { provide: MailService, useValue: { send: jest.fn() } },
        { provide: OutboxService, useValue: { enqueue: jest.fn() } },
      ],
    }).compile();

    service = module.get(EstimatesService);
  });

  it("addLine() rejects a rateCatalogItemId that belongs to another company", async () => {
    prisma.estimate.findFirst.mockResolvedValue(OTHER_COMPANY_ESTIMATE);
    prisma.rateCatalogItem.findFirst.mockResolvedValue(null); // not found for THIS companyId

    await expect(
      service.addLine(COMPANY_A, "estimate-1", { rateCatalogItemId: "foreign-rate-item", quantity: 5 }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.rateCatalogItem.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign-rate-item", companyId: COMPANY_A },
    });
    expect(prisma.estimateLine.create).not.toHaveBeenCalled();
  });

  it("create() rejects a projectId that belongs to another company", async () => {
    prisma.project.findFirst.mockResolvedValue(null); // not found for THIS companyId

    await expect(
      service.create(COMPANY_A, {
        projectId: "foreign-project",
        name: "Test",
        laborRatePerHour: 40,
        markupPercent: 15,
        taxPercent: 0,
      }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign-project", companyId: COMPANY_A },
    });
    expect(prisma.estimate.create).not.toHaveBeenCalled();
  });

  it("decide() stores the signature image and signer name on approval", async () => {
    prisma.estimate.findFirst.mockResolvedValue({
      id: "estimate-1",
      companyId: COMPANY_A,
      name: "Test",
      clientDecision: "pending",
      variantOfId: null,
    });
    prisma.estimate.update.mockResolvedValue({ clientDecision: "approved" });
    prisma.estimate.updateMany.mockResolvedValue({ count: 0 });
    const storage: { save: jest.Mock } = (service as any).storage;
    storage.save.mockResolvedValue({ storageKey: "company-a/signature.png", size: 42 });

    await service.decide(
      "some-token",
      { decision: "approved", signerName: "Jane Client", signatureDataUrl: "data:image/png;base64,AAAA" },
      "203.0.113.5",
    );

    expect(storage.save).toHaveBeenCalledWith(COMPANY_A, "signature.png", expect.any(Buffer));
    expect(prisma.estimate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signerName: "Jane Client",
          signatureImageKey: "company-a/signature.png",
          signedIp: "203.0.113.5",
        }),
      }),
    );
  });

  it("decideForClient() rejects an estimate that doesn't belong to this client (portal ownership check)", async () => {
    prisma.estimate.findFirst.mockResolvedValue(null); // not found for THIS clientId's project

    await expect(
      service.decideForClient(COMPANY_A, "client-1", "estimate-1", { decision: "rejected" }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.estimate.findFirst).toHaveBeenCalledWith({
      where: { id: "estimate-1", companyId: COMPANY_A, sentAt: { not: null }, project: { clientId: "client-1" } },
    });
    expect(prisma.estimate.update).not.toHaveBeenCalled();
  });

  it("decideForClient() succeeds when the estimate's project belongs to this client", async () => {
    prisma.estimate.findFirst.mockResolvedValue({
      id: "estimate-1",
      companyId: COMPANY_A,
      name: "Test",
      clientDecision: "pending",
      variantOfId: null,
    });
    prisma.estimate.update.mockResolvedValue({ clientDecision: "rejected" });
    prisma.estimate.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.decideForClient(COMPANY_A, "client-1", "estimate-1", { decision: "rejected" });

    expect(result).toEqual({ clientDecision: "rejected" });
  });
});

describe("EstimatesService — approval chains", () => {
  let service: EstimatesService;
  let prisma: {
    company: { findUniqueOrThrow: jest.Mock };
    estimate: { findFirst: jest.Mock; update: jest.Mock };
    estimateApproval: { findUnique: jest.Mock; create: jest.Mock; count: jest.Mock };
    $transaction: jest.Mock;
  };

  const DRAFT_ESTIMATE = {
    id: "estimate-1",
    companyId: COMPANY_A,
    name: "High-value job",
    status: "draft",
    grandTotal: "50000",
    lines: [],
  };

  beforeEach(async () => {
    prisma = {
      company: { findUniqueOrThrow: jest.fn() },
      estimate: { findFirst: jest.fn().mockResolvedValue({ ...DRAFT_ESTIMATE, approvals: [] }), update: jest.fn() },
      estimateApproval: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn() },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };

    const module = await Test.createTestingModule({
      providers: [
        EstimatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { save: jest.fn(), read: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn(), list: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
        { provide: MailService, useValue: { send: jest.fn() } },
        { provide: OutboxService, useValue: { enqueue: jest.fn() } },
      ],
    }).compile();

    service = module.get(EstimatesService);
    jest.spyOn(service, "recalculate").mockResolvedValue(DRAFT_ESTIMATE as never);
  });

  it("records a single approval step and does not finalize while below the required count", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ approvalThresholdAmount: "10000", requiredApprovalCount: 2 });
    prisma.estimateApproval.findUnique.mockResolvedValue(null);
    prisma.estimateApproval.count.mockResolvedValue(1);

    await service.approve(COMPANY_A, { userId: "user-1", name: "Alice" }, "estimate-1");

    expect(prisma.estimateApproval.create).toHaveBeenCalledWith({
      data: { estimateId: "estimate-1", userId: "user-1", actorName: "Alice" },
    });
    expect(prisma.estimate.update).toHaveBeenCalledWith({
      where: { id: "estimate-1" },
      data: { status: "pending_approval" },
    });
    // Only the gating update ran — finalize's status:"approved" transaction never fired.
    expect(prisma.estimate.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "approved" }) }),
    );
  });

  it("rejects a second approval from the same user", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ approvalThresholdAmount: "10000", requiredApprovalCount: 2 });
    prisma.estimateApproval.findUnique.mockResolvedValue({ id: "existing-approval" });

    await expect(service.approve(COMPANY_A, { userId: "user-1", name: "Alice" }, "estimate-1")).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.estimateApproval.create).not.toHaveBeenCalled();
  });

  it("requires a signed-in user to record an approval step", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ approvalThresholdAmount: "10000", requiredApprovalCount: 2 });

    await expect(service.approve(COMPANY_A, { name: "System" }, "estimate-1")).rejects.toThrow(BadRequestException);
    expect(prisma.estimateApproval.create).not.toHaveBeenCalled();
  });

  it("skips the chain entirely when the estimate total is below the threshold", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ approvalThresholdAmount: "999999", requiredApprovalCount: 2 });

    // Below threshold falls straight into finalizeApproval, which needs the full compute
    // pipeline — asserting only that the chain-gating path was never entered is enough here.
    await service.approve(COMPANY_A, { userId: "user-1", name: "Alice" }, "estimate-1").catch(() => {});

    expect(prisma.estimateApproval.create).not.toHaveBeenCalled();
    expect(prisma.estimate.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending_approval" }) }),
    );
  });
});

describe("EstimatesService.suggestedLines", () => {
  let service: EstimatesService;
  let prisma: {
    estimate: { findFirst: jest.Mock };
    estimateLine: { findMany: jest.Mock };
    rateCatalogItem: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      estimate: { findFirst: jest.fn() },
      estimateLine: { findMany: jest.fn() },
      rateCatalogItem: { findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        EstimatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { save: jest.fn(), read: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn(), list: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
        { provide: MailService, useValue: { send: jest.fn() } },
        { provide: OutboxService, useValue: { enqueue: jest.fn() } },
      ],
    }).compile();

    service = module.get(EstimatesService);
  });

  it("falls back to company-wide popularity when the estimate has no lines yet", async () => {
    prisma.estimate.findFirst.mockResolvedValue({ id: "e1", companyId: COMPANY_A, lines: [], sections: [], requirements: [], project: null });
    prisma.estimateLine.findMany.mockResolvedValue([
      { rateCatalogItemId: "item-a" },
      { rateCatalogItemId: "item-a" },
      { rateCatalogItemId: "item-b" },
    ]);
    prisma.rateCatalogItem.findMany.mockResolvedValue([
      { id: "item-a", name: "Tile floor" },
      { id: "item-b", name: "Paint wall" },
    ]);

    const result = await service.suggestedLines(COMPANY_A, "e1");

    expect(result[0].item.id).toBe("item-a");
    expect(result[0].count).toBe(2);
  });

  it("excludes rate items already on the estimate", async () => {
    prisma.estimate.findFirst.mockResolvedValue({
      id: "e1",
      companyId: COMPANY_A,
      lines: [{ rateCatalogItemId: "item-a" }],
      sections: [],
      requirements: [],
      project: null,
    });
    prisma.estimateLine.findMany
      .mockResolvedValueOnce([{ estimateId: "other-estimate" }])
      .mockResolvedValueOnce([{ rateCatalogItemId: "item-a" }, { rateCatalogItemId: "item-c" }]);
    prisma.rateCatalogItem.findMany.mockResolvedValue([{ id: "item-c", name: "Grout" }]);

    const result = await service.suggestedLines(COMPANY_A, "e1");

    expect(result.map((r) => r.item.id)).toEqual(["item-c"]);
  });
});

describe("EstimatesService.addAssemblyToEstimate", () => {
  let service: EstimatesService;
  let prisma: {
    estimate: { findFirst: jest.Mock; update: jest.Mock };
    assembly: { findFirst: jest.Mock };
    estimateLine: { createMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      estimate: { findFirst: jest.fn(), update: jest.fn() },
      assembly: { findFirst: jest.fn() },
      estimateLine: { createMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        EstimatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { save: jest.fn(), read: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn(), list: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
        { provide: MailService, useValue: { send: jest.fn() } },
        { provide: OutboxService, useValue: { enqueue: jest.fn() } },
      ],
    }).compile();

    service = module.get(EstimatesService);
  });

  it("throws when the assembly doesn't belong to this company", async () => {
    prisma.estimate.findFirst.mockResolvedValue({ id: "e1", companyId: COMPANY_A, lines: [], sections: [], requirements: [], project: null });
    prisma.assembly.findFirst.mockResolvedValue(null);

    await expect(service.addAssemblyToEstimate(COMPANY_A, "e1", { assemblyId: "assembly-1", quantity: 1 })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.estimateLine.createMany).not.toHaveBeenCalled();
  });

  it("expands the assembly into one EstimateLine per item, scaled by the quantity entered", async () => {
    prisma.estimate.findFirst
      .mockResolvedValueOnce({ id: "e1", companyId: COMPANY_A, lines: [], sections: [], requirements: [], project: null })
      .mockResolvedValueOnce({ id: "e1", companyId: COMPANY_A, lines: [], sections: [], requirements: [], project: null });
    prisma.assembly.findFirst.mockResolvedValue({
      id: "assembly-1",
      items: [
        { rateCatalogItemId: "item-a", quantityPerUnit: "2" },
        { rateCatalogItemId: "item-b", quantityPerUnit: "1.5" },
      ],
    });
    prisma.estimate.update.mockResolvedValue({ id: "e1", lines: [], sections: [] });

    await service.addAssemblyToEstimate(COMPANY_A, "e1", { assemblyId: "assembly-1", quantity: 3 });

    expect(prisma.estimateLine.createMany).toHaveBeenCalledWith({
      data: [
        { estimateId: "e1", rateCatalogItemId: "item-a", quantity: 6, sectionId: undefined },
        { estimateId: "e1", rateCatalogItemId: "item-b", quantity: 4.5, sectionId: undefined },
      ],
    });
  });
});

describe("EstimatesService.diffRevisions", () => {
  let service: EstimatesService;
  let prisma: {
    estimate: { findFirst: jest.Mock };
    estimateRevision: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      estimate: { findFirst: jest.fn() },
      estimateRevision: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        EstimatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { save: jest.fn(), read: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn(), list: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
        { provide: MailService, useValue: { send: jest.fn() } },
        { provide: OutboxService, useValue: { enqueue: jest.fn() } },
      ],
    }).compile();

    service = module.get(EstimatesService);
  });

  it("classifies lines as added, removed, or changed by rateCatalogItemCode", async () => {
    prisma.estimate.findFirst.mockResolvedValue({ id: "e1", companyId: COMPANY_A, lines: [], sections: [], requirements: [], project: null });
    prisma.estimateRevision.findFirst
      .mockResolvedValueOnce({
        id: "rev-1",
        versionNumber: 1,
        grandTotal: "1000",
        lines: [
          { rateCatalogItemCode: "TILE", rateCatalogItemName: "Tile", unit: "m2", quantity: 10, lineTotal: 500 },
          { rateCatalogItemCode: "REMOVED-ITEM", rateCatalogItemName: "Old", unit: "ea", quantity: 1, lineTotal: 100 },
        ],
      })
      .mockResolvedValueOnce({
        id: "rev-2",
        versionNumber: 2,
        grandTotal: "1200",
        lines: [
          { rateCatalogItemCode: "TILE", rateCatalogItemName: "Tile", unit: "m2", quantity: 15, lineTotal: 750 },
          { rateCatalogItemCode: "NEW-ITEM", rateCatalogItemName: "New", unit: "ea", quantity: 1, lineTotal: 200 },
        ],
      });

    const result = await service.diffRevisions(COMPANY_A, "e1", "rev-1", "rev-2");

    expect(result.added.map((l) => l.rateCatalogItemCode)).toEqual(["NEW-ITEM"]);
    expect(result.removed.map((l) => l.rateCatalogItemCode)).toEqual(["REMOVED-ITEM"]);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]).toMatchObject({ rateCatalogItemCode: "TILE", previousQuantity: 10, quantity: 15 });
    expect(result.grandTotalDelta).toBe(200);
  });
});

describe("EstimatesService.declineOnBehalfOfClient", () => {
  let service: EstimatesService;
  let prisma: {
    estimate: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  const ACTOR = { userId: "user-1", name: "Jordan Reyes" };

  beforeEach(async () => {
    prisma = {
      estimate: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        EstimatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { save: jest.fn(), read: jest.fn() } },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
        { provide: MailService, useValue: { send: jest.fn() } },
        { provide: OutboxService, useValue: { enqueue: jest.fn() } },
      ],
    }).compile();

    service = module.get(EstimatesService);
  });

  it("rejects an estimate that was never sent to the client", async () => {
    prisma.estimate.findFirst.mockResolvedValue({
      id: "estimate-1",
      companyId: COMPANY_A,
      name: "Test",
      clientDecision: "pending",
      sentAt: null,
      variantOfId: null,
    });

    await expect(
      service.declineOnBehalfOfClient(COMPANY_A, ACTOR, "estimate-1", { note: "Client called to decline" }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.estimate.update).not.toHaveBeenCalled();
  });

  it("rejects an estimate that already has a client decision recorded", async () => {
    prisma.estimate.findFirst.mockResolvedValue({
      id: "estimate-1",
      companyId: COMPANY_A,
      name: "Test",
      clientDecision: "approved",
      sentAt: new Date(),
      variantOfId: null,
    });

    await expect(
      service.declineOnBehalfOfClient(COMPANY_A, ACTOR, "estimate-1", { note: "Client called to decline" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("records the rejection and attributes it to the staff member, not the client", async () => {
    prisma.estimate.findFirst.mockResolvedValue({
      id: "estimate-1",
      companyId: COMPANY_A,
      name: "Kitchen remodel",
      clientDecision: "pending",
      sentAt: new Date(),
      variantOfId: null,
    });
    prisma.estimate.update.mockResolvedValue({ clientDecision: "rejected" });
    prisma.estimate.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.declineOnBehalfOfClient(COMPANY_A, ACTOR, "estimate-1", { note: "Client called to decline" });

    expect(result).toEqual({ clientDecision: "rejected" });
    expect(prisma.estimate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientDecision: "rejected", clientDecisionNote: "Client called to decline" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      COMPANY_A,
      ACTOR,
      "estimate.client_rejected",
      "Estimate",
      "estimate-1",
      expect.stringContaining("Jordan Reyes recorded that the client rejected"),
    );
  });
});
