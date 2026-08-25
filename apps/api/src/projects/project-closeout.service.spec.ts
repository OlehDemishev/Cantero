import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ProjectCloseoutService } from "./project-closeout.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { InvoicesService } from "../finance/invoices.service";
import { DocumentsService } from "../documents/documents.service";

describe("ProjectCloseoutService", () => {
  let service: ProjectCloseoutService;
  let prisma: {
    project: { findFirst: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    punchListItem: { findMany: jest.Mock };
    rfi: { findMany: jest.Mock };
    warrantyClaim: { findMany: jest.Mock };
    invoice: { findMany: jest.Mock };
  };
  let pdfService: { render: jest.Mock };
  let storage: { read: jest.Mock };
  let invoices: { generatePdf: jest.Mock };
  let documents: { list: jest.Mock };

  const project = {
    id: "project-1",
    name: "Riverside Renovation",
    address: "1 River Rd",
    handoverDate: new Date("2026-01-01"),
    warrantyMonths: 12,
    client: { name: "Acme Corp" },
  };
  const company = { currency: "EUR", logoStorageKey: null, brandColor: null };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
      punchListItem: { findMany: jest.fn() },
      rfi: { findMany: jest.fn() },
      warrantyClaim: { findMany: jest.fn() },
      invoice: { findMany: jest.fn() },
    };
    pdfService = { render: jest.fn().mockResolvedValue(Buffer.from("PDF-BYTES")) };
    storage = { read: jest.fn().mockResolvedValue(Buffer.from("FILE-BYTES")) };
    invoices = { generatePdf: jest.fn().mockResolvedValue(Buffer.from("INVOICE-PDF-BYTES")) };
    documents = { list: jest.fn().mockResolvedValue([]) };

    prisma.project.findFirst.mockResolvedValue(project);
    prisma.company.findUniqueOrThrow.mockResolvedValue(company);
    prisma.punchListItem.findMany.mockResolvedValue([]);
    prisma.rfi.findMany.mockResolvedValue([]);
    prisma.warrantyClaim.findMany.mockResolvedValue([]);
    prisma.invoice.findMany.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        ProjectCloseoutService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: pdfService },
        { provide: StorageService, useValue: storage },
        { provide: InvoicesService, useValue: invoices },
        { provide: DocumentsService, useValue: documents },
      ],
    }).compile();

    service = module.get(ProjectCloseoutService);
  });

  it("throws when the project doesn't belong to the company", async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(service.buildPackage("company-a", "project-1")).rejects.toThrow(NotFoundException);
  });

  it("produces a real ZIP buffer containing at least the closeout summary", async () => {
    const buffer = await service.buildPackage("company-a", "project-1");

    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(buffer.toString("latin1")).toContain("closeout-summary.pdf");
    expect(invoices.generatePdf).not.toHaveBeenCalled();
  });

  it("includes the latest invoice's PDF when the project has invoices", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: "inv-2", number: "INV-0002", status: "sent", total: 5000, createdAt: new Date("2026-02-01") },
      { id: "inv-1", number: "INV-0001", status: "paid", total: 4000, createdAt: new Date("2026-01-01") },
    ]);

    const buffer = await service.buildPackage("company-a", "project-1");

    expect(invoices.generatePdf).toHaveBeenCalledWith("company-a", "inv-2");
    expect(buffer.toString("latin1")).toContain("invoice-INV-0002.pdf");
  });

  it("excludes void invoices from the total-invoiced figure passed to the summary PDF", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: "inv-1", number: "INV-0001", status: "void", total: 9999, createdAt: new Date("2026-01-01") },
      { id: "inv-2", number: "INV-0002", status: "paid", total: 1000, createdAt: new Date("2026-02-01") },
    ]);

    await service.buildPackage("company-a", "project-1");

    const summarySpec = pdfService.render.mock.calls[0][0];
    const totalInvoiced = summarySpec.totals.find((t: { label: string }) => t.label === "Total invoiced");
    expect(totalInvoiced.value).toBe("1000.00 EUR");
  });

  it("disambiguates two stored documents that share the same filename", async () => {
    documents.list.mockResolvedValue([
      { id: "doc-11111111", name: "contract.pdf", storageKey: "company-a/aaa" },
      { id: "doc-22222222", name: "contract.pdf", storageKey: "company-a/bbb" },
    ]);

    const buffer = await service.buildPackage("company-a", "project-1");
    const text = buffer.toString("latin1");

    expect(text).toContain("documents/contract.pdf");
    expect(text).toContain("documents/contract-doc-2222.pdf");
  });
});
