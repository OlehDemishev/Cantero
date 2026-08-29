import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CompanyCoiService } from "./company-coi.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { StorageService } from "../common/storage/storage.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Jane" };

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

describe("CompanyCoiService", () => {
  let service: CompanyCoiService;
  let prisma: {
    companyDocument: { findMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    document: { findFirst: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let storage: { read: jest.Mock };

  beforeEach(async () => {
    prisma = {
      companyDocument: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
      company: { findUniqueOrThrow: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
      document: { findFirst: jest.fn() },
    };
    audit = { record: jest.fn() };
    storage = { read: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CompanyCoiService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get(CompanyCoiService);
  });

  describe("addDocument()", () => {
    it("records an audit entry on success", async () => {
      prisma.companyDocument.create.mockResolvedValue({ id: "doc-1", expiresAt: daysFromNow(365) });

      await service.addDocument(COMPANY_A, ACTOR, {
        type: "general_liability_insurance",
        name: "GL Policy",
        expiresAt: daysFromNow(365).toISOString(),
      });

      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("deleteDocument()", () => {
    it("rejects deleting a document that doesn't belong to this company", async () => {
      prisma.companyDocument.findFirst.mockResolvedValue(null);

      await expect(service.deleteDocument(COMPANY_A, "doc-1")).rejects.toThrow(NotFoundException);
      expect(prisma.companyDocument.delete).not.toHaveBeenCalled();
    });
  });

  describe("setCoiPubliclyShared()", () => {
    it("generates a token the first time sharing is turned on", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, coiPublicToken: null });
      prisma.company.update.mockResolvedValue({ id: COMPANY_A, coiPubliclyShared: true, coiPublicToken: "generated" });

      await service.setCoiPubliclyShared(COMPANY_A, true);

      const call = prisma.company.update.mock.calls[0][0];
      expect(call.data.coiPubliclyShared).toBe(true);
      expect(typeof call.data.coiPublicToken).toBe("string");
      expect(call.data.coiPublicToken.length).toBeGreaterThan(0);
    });

    it("keeps the existing token when re-enabling after it was already generated once", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, coiPublicToken: "existing-token" });
      prisma.company.update.mockResolvedValue({});

      await service.setCoiPubliclyShared(COMPANY_A, true);

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: COMPANY_A },
        data: { coiPubliclyShared: true, coiPublicToken: "existing-token" },
      });
    });
  });

  describe("getPublicCoi()", () => {
    it("rejects an unknown or unshared token", async () => {
      prisma.company.findFirst.mockResolvedValue(null);

      await expect(service.getPublicCoi("bad-token")).rejects.toThrow(NotFoundException);
    });

    it("excludes expired documents from the public listing", async () => {
      prisma.company.findFirst.mockResolvedValue({ id: COMPANY_A, name: "Acme Construction" });
      prisma.companyDocument.findMany.mockResolvedValue([
        { id: "doc-1", type: "general_liability_insurance", name: "GL Policy", expiresAt: daysFromNow(60), attachments: [] },
      ]);

      const result = await service.getPublicCoi("good-token");

      expect(result.companyName).toBe("Acme Construction");
      expect(result.documents).toHaveLength(1);
      const call = prisma.companyDocument.findMany.mock.calls[0][0];
      expect(call.where.expiresAt.gt).toBeInstanceOf(Date);
    });
  });

  describe("downloadPublicDocument()", () => {
    it("rejects an unknown or unshared token", async () => {
      prisma.company.findFirst.mockResolvedValue(null);

      await expect(service.downloadPublicDocument("bad-token", "doc-1")).rejects.toThrow(NotFoundException);
      expect(storage.read).not.toHaveBeenCalled();
    });

    it("rejects a document that isn't a current attachment of this company's COI", async () => {
      prisma.company.findFirst.mockResolvedValue({ id: COMPANY_A });
      prisma.document.findFirst.mockResolvedValue(null);

      await expect(service.downloadPublicDocument("good-token", "doc-1")).rejects.toThrow(NotFoundException);
      expect(storage.read).not.toHaveBeenCalled();
    });

    it("streams the file once ownership and expiry are confirmed", async () => {
      prisma.company.findFirst.mockResolvedValue({ id: COMPANY_A });
      prisma.document.findFirst.mockResolvedValue({ id: "file-1", storageKey: "key-1", name: "gl-policy.pdf", mimeType: "application/pdf" });
      storage.read.mockResolvedValue(Buffer.from("pdf-bytes"));

      const result = await service.downloadPublicDocument("good-token", "file-1");

      expect(result.name).toBe("gl-policy.pdf");
      expect(storage.read).toHaveBeenCalledWith("key-1");
    });
  });
});
