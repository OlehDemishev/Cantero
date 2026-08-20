import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { EstimatesService } from "./estimates.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";

const COMPANY_A = "company-a";
const OTHER_COMPANY_ESTIMATE = {
  id: "estimate-1",
  companyId: COMPANY_A,
  lines: [],
  sections: [],
  requirements: [],
  project: null,
};

describe("EstimatesService — cross-tenant isolation", () => {
  let service: EstimatesService;
  let prisma: {
    estimate: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    project: { findFirst: jest.Mock };
    rateCatalogItem: { findFirst: jest.Mock };
    estimateLine: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      estimate: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      project: { findFirst: jest.fn() },
      rateCatalogItem: { findFirst: jest.fn() },
      estimateLine: { create: jest.fn() },
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
});
