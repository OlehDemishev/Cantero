import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DocumentsService } from "./documents.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const FILE = { originalname: "photo.jpg", mimetype: "image/jpeg", buffer: Buffer.from("x"), size: 1 };

describe("DocumentsService.upload — field attachments", () => {
  let service: DocumentsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    invoice: { findFirst: jest.Mock };
    punchListItem: { findFirst: jest.Mock };
    dailyLog: { findFirst: jest.Mock };
    incidentReport: { findFirst: jest.Mock };
    warrantyClaim: { findFirst: jest.Mock };
    subcontractorDocument: { findFirst: jest.Mock };
    document: { create: jest.Mock };
  };
  let storage: { save: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      invoice: { findFirst: jest.fn() },
      punchListItem: { findFirst: jest.fn() },
      dailyLog: { findFirst: jest.fn() },
      incidentReport: { findFirst: jest.fn() },
      warrantyClaim: { findFirst: jest.fn() },
      subcontractorDocument: { findFirst: jest.fn() },
      document: { create: jest.fn() },
    };
    storage = { save: jest.fn().mockResolvedValue({ storageKey: "company-a/x-photo.jpg", size: 1 }) };

    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(DocumentsService);
  });

  it("rejects when the punch list item does not belong to this company", async () => {
    prisma.punchListItem.findFirst.mockResolvedValue(null);

    await expect(service.upload(COMPANY_A, "user-1", FILE, { punchListItemId: "item-1" })).rejects.toThrow(NotFoundException);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it("rejects when the daily log does not belong to this company", async () => {
    prisma.dailyLog.findFirst.mockResolvedValue(null);

    await expect(service.upload(COMPANY_A, "user-1", FILE, { dailyLogId: "log-1" })).rejects.toThrow(NotFoundException);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it("rejects when the incident report does not belong to this company", async () => {
    prisma.incidentReport.findFirst.mockResolvedValue(null);

    await expect(service.upload(COMPANY_A, "user-1", FILE, { incidentReportId: "inc-1" })).rejects.toThrow(NotFoundException);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it("rejects when the warranty claim does not belong to this company", async () => {
    prisma.warrantyClaim.findFirst.mockResolvedValue(null);

    await expect(service.upload(COMPANY_A, "user-1", FILE, { warrantyClaimId: "claim-1" })).rejects.toThrow(NotFoundException);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it("attaches the photo to the punch list item once ownership is confirmed", async () => {
    prisma.punchListItem.findFirst.mockResolvedValue({ id: "item-1", companyId: COMPANY_A });
    prisma.document.create.mockResolvedValue({ id: "doc-1" });

    await service.upload(COMPANY_A, "user-1", FILE, { punchListItemId: "item-1", category: "photo" });

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ punchListItemId: "item-1", category: "photo" }) }),
    );
  });

  it("rejects when the subcontractor document does not belong to this company", async () => {
    prisma.subcontractorDocument.findFirst.mockResolvedValue(null);

    await expect(service.upload(COMPANY_A, "user-1", FILE, { subcontractorDocumentId: "sub-doc-1" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it("attaches the certificate scan to the subcontractor document once ownership is confirmed", async () => {
    prisma.subcontractorDocument.findFirst.mockResolvedValue({ id: "sub-doc-1", companyId: COMPANY_A });
    prisma.document.create.mockResolvedValue({ id: "doc-1" });

    await service.upload(COMPANY_A, "user-1", FILE, { subcontractorDocumentId: "sub-doc-1", category: "insurance_certificate" });

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subcontractorDocumentId: "sub-doc-1", category: "insurance_certificate" }),
      }),
    );
  });
});
