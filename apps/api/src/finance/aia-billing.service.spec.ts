import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AiaBillingService } from "./aia-billing.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";

const COMPANY_A = "company-a";
const CONCRETE = { code: "03 00 00", name: "Concrete" };
const ELECTRICAL = { code: "26 00 00", name: "Electrical" };

describe("AiaBillingService.generatePdf", () => {
  let service: AiaBillingService;
  let prisma: {
    invoice: { findFirst: jest.Mock };
    estimate: { findUniqueOrThrow: jest.Mock };
    changeOrder: { findMany: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let pdf: { render: jest.Mock };

  beforeEach(async () => {
    prisma = {
      invoice: { findFirst: jest.fn() },
      estimate: { findUniqueOrThrow: jest.fn() },
      changeOrder: { findMany: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
    };
    pdf = { render: jest.fn().mockResolvedValue(Buffer.from("PDF")) };

    const module = await Test.createTestingModule({
      providers: [
        AiaBillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: pdf },
        { provide: StorageService, useValue: { read: jest.fn() } },
      ],
    }).compile();

    service = module.get(AiaBillingService);
    // findFirst on `prisma.invoice` is reused both for the invoice itself and the "last prior draw"
    // lookup — the tests below stub each call in sequence via mockResolvedValueOnce.
  });

  it("rejects an invoice that isn't a progress-billing draw", async () => {
    prisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", companyId: COMPANY_A, estimateId: null, percentComplete: null });

    await expect(service.generatePdf(COMPANY_A, "inv-1")).rejects.toThrow(BadRequestException);
  });

  it("rejects when the invoice doesn't belong to this company", async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(service.generatePdf(COMPANY_A, "inv-1")).rejects.toThrow(NotFoundException);
  });

  it("scales scheduled values to the estimate's grandTotal and computes this-period amounts against the prior draw", async () => {
    prisma.invoice.findFirst
      .mockResolvedValueOnce({
        id: "inv-2",
        companyId: COMPANY_A,
        estimateId: "est-1",
        percentComplete: "50",
        retainagePercent: "10",
        total: "500.00",
        number: "INV-0002",
        createdAt: new Date("2026-06-01"),
        project: { name: "Riverside Reno" },
        client: { name: "Acme Client" },
      })
      .mockResolvedValueOnce({ id: "inv-1", percentComplete: "25" }); // the prior draw

    prisma.estimate.findUniqueOrThrow.mockResolvedValue({
      id: "est-1",
      grandTotal: "1100.00", // raw line total is 1000, so scale factor is 1.1
      lines: [
        { lineTotal: "800.00", costCode: CONCRETE },
        { lineTotal: "200.00", costCode: null },
      ],
    });
    prisma.changeOrder.findMany.mockResolvedValue([
      { grandTotal: "220.00", lines: [{ lineTotal: "200.00", costCode: ELECTRICAL }] }, // scale factor 1.1
    ]);
    prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Acme Co", logoStorageKey: null, brandColor: null });

    await service.generatePdf(COMPANY_A, "inv-2");

    const spec = pdf.render.mock.calls[0][0];
    const concreteRow = spec.tableRows.find((r: { cells: string[] }) => r.cells[0] === CONCRETE.code)!;
    // scheduled value 880 (800*1.1); previous 25% = 220.00; this period (50%-25%) = 220.00; to date 50% = 440.00
    expect(concreteRow.cells[2]).toBe("880.00");
    expect(concreteRow.cells[3]).toBe("220.00");
    expect(concreteRow.cells[4]).toBe("220.00");
    expect(concreteRow.cells[5]).toBe("440.00");

    const totalsByLabel = Object.fromEntries(spec.totals.map((t: { label: string; value: string }) => [t.label, t.value]));
    expect(totalsByLabel["Original contract sum"]).toBe("1100.00");
    expect(totalsByLabel["Net change by change orders"]).toBe("220.00");
    expect(totalsByLabel["Contract sum to date"]).toBe("1320.00");
    expect(totalsByLabel["Current payment due"]).toBe("500.00");
  });
});
