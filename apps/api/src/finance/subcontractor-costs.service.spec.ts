import { Test } from "@nestjs/testing";
import { SubcontractorCostsService } from "./subcontractor-costs.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Jane" };

describe("SubcontractorCostsService.markPaid", () => {
  let service: SubcontractorCostsService;
  let prisma: {
    subcontractorCost: { findFirst: jest.Mock; update: jest.Mock };
    lienWaiver: { findUnique: jest.Mock; create: jest.Mock };
    subcontractorPayment: { create: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      subcontractorCost: { findFirst: jest.fn(), update: jest.fn() },
      lienWaiver: { findUnique: jest.fn(), create: jest.fn() },
      subcontractorPayment: { create: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SubcontractorCostsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(SubcontractorCostsService);
  });

  it("auto-requests a conditional-progress lien waiver when none exists yet", async () => {
    prisma.subcontractorCost.findFirst
      .mockResolvedValueOnce({ id: "cost-1", companyId: COMPANY_A, subcontractorId: "sub-1", amount: 1000, paid: false })
      .mockResolvedValueOnce({
        id: "cost-1",
        companyId: COMPANY_A,
        projectId: "p1",
        subcontractorId: "sub-1",
        amount: 1000,
        paid: false,
        subcontractor: { name: "Acme Sub" },
      });
    prisma.subcontractorCost.update.mockResolvedValue({ id: "cost-1", paid: true, subcontractor: { name: "Acme Sub" } });
    prisma.lienWaiver.findUnique.mockResolvedValue(null);
    prisma.lienWaiver.create.mockResolvedValue({ id: "waiver-1", type: "conditional_progress" });

    await service.markPaid(COMPANY_A, ACTOR, "cost-1");

    expect(prisma.lienWaiver.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "conditional_progress", subcontractorCostId: "cost-1" }) }),
    );
  });

  it("records a SubcontractorPayment tied to this cost, so 1099 totals aren't computed from the undated `paid` flag alone", async () => {
    prisma.subcontractorCost.findFirst.mockResolvedValueOnce({
      id: "cost-1",
      companyId: COMPANY_A,
      subcontractorId: "sub-1",
      amount: 1000,
      paid: false,
    });
    prisma.subcontractorCost.update.mockResolvedValue({ id: "cost-1", paid: true, subcontractor: { name: "Acme Sub" } });
    prisma.lienWaiver.findUnique.mockResolvedValue({ id: "existing-waiver" });

    await service.markPaid(COMPANY_A, ACTOR, "cost-1");

    expect(prisma.subcontractorPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: COMPANY_A, subcontractorId: "sub-1", subcontractorCostId: "cost-1", amount: 1000 }),
    });
  });

  it("does not request a second lien waiver when one already exists", async () => {
    prisma.subcontractorCost.findFirst.mockResolvedValueOnce({ id: "cost-1", companyId: COMPANY_A, subcontractorId: "sub-1", amount: 1000, paid: false });
    prisma.subcontractorCost.update.mockResolvedValue({ id: "cost-1", paid: true, subcontractor: { name: "Acme Sub" } });
    prisma.lienWaiver.findUnique.mockResolvedValue({ id: "existing-waiver" });

    await service.markPaid(COMPANY_A, ACTOR, "cost-1");

    expect(prisma.lienWaiver.create).not.toHaveBeenCalled();
  });

  it("throws when the cost doesn't belong to this company", async () => {
    prisma.subcontractorCost.findFirst.mockResolvedValueOnce(null);

    await expect(service.markPaid(COMPANY_A, ACTOR, "missing")).rejects.toThrow("not found");
    expect(prisma.subcontractorCost.update).not.toHaveBeenCalled();
  });
});

describe("SubcontractorCostsService.exportDatevPurchasesCsv", () => {
  let service: SubcontractorCostsService;
  let prisma: {
    subcontractorCost: { findMany: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };

  const completeDatevCompany = {
    name: "Cantero Bau GmbH",
    datevConsultantNumber: "12345",
    datevClientNumber: "1001",
    datevFiscalYearStartMonth: 1,
    datevFiscalYearStartDay: 1,
    datevSachkontenlaenge: 4,
    datevPayablesAccount: "1600",
    datevExpenseAccountSubcontractors: "3300",
  };

  beforeEach(async () => {
    prisma = {
      subcontractorCost: { findMany: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        SubcontractorCostsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(SubcontractorCostsService);
  });

  it("rejects when DATEV company settings are incomplete", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ ...completeDatevCompany, datevPayablesAccount: null });
    await expect(service.exportDatevPurchasesCsv(COMPANY_A)).rejects.toThrow("Can't generate a DATEV export");
    expect(prisma.subcontractorCost.findMany).not.toHaveBeenCalled();
  });

  it("skips a cost whose subcontractor has no DATEV Kreditor number, and reports a warning", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue(completeDatevCompany);
    prisma.subcontractorCost.findMany.mockResolvedValue([
      {
        id: "cost-1",
        description: "Electrical rough-in",
        amount: "5000",
        incurredDate: new Date("2026-08-15"),
        subcontractor: { name: "No Kreditor Sub", datevKreditorNumber: null },
      },
    ]);

    const { csv, warnings } = await service.exportDatevPurchasesCsv(COMPANY_A);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("No Kreditor Sub");
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("includes an unpaid cost — no paid filter, since it's a liability from the moment it's logged", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue(completeDatevCompany);
    prisma.subcontractorCost.findMany.mockResolvedValue([
      {
        id: "cost-1",
        description: "Electrical rough-in",
        amount: "5000",
        incurredDate: new Date("2026-08-15"),
        paid: false,
        subcontractor: { name: "ElectroPro", datevKreditorNumber: "70001" },
      },
    ]);

    const { csv } = await service.exportDatevPurchasesCsv(COMPANY_A);
    const dataRow = csv.split("\r\n")[2];
    expect(dataRow.split(";")[0]).toBe("5000,00");
    expect(dataRow.split(";")[6]).toBe("70001"); // Konto
    expect(dataRow.split(";")[7]).toBe("3300"); // Gegenkonto — subcontractor expense account
  });
});
