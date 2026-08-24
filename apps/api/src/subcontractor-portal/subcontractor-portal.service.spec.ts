import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SubcontractorPortalService } from "./subcontractor-portal.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";

const SUBCONTRACTOR_A = { subcontractorId: "sub-a", companyId: "company-a" };
const SIGNATURE_DATA_URL = "data:image/png;base64,aGVsbG8=";

describe("SubcontractorPortalService", () => {
  let service: SubcontractorPortalService;
  let prisma: {
    subcontractorAssignment: { findFirst: jest.Mock };
    subcontractorCost: { create: jest.Mock };
    lienWaiver: { findFirst: jest.Mock; update: jest.Mock };
  };
  let storage: { save: jest.Mock };

  beforeEach(async () => {
    prisma = {
      subcontractorAssignment: { findFirst: jest.fn() },
      subcontractorCost: { create: jest.fn() },
      lienWaiver: { findFirst: jest.fn(), update: jest.fn() },
    };
    storage = { save: jest.fn().mockResolvedValue({ storageKey: "sig-key" }) };

    const module = await Test.createTestingModule({
      providers: [
        SubcontractorPortalService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get(SubcontractorPortalService);
  });

  describe("submitCost()", () => {
    it("rejects logging a cost against a project this subcontractor isn't assigned to", async () => {
      prisma.subcontractorAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.submitCost(SUBCONTRACTOR_A, {
          projectId: "unassigned-project",
          description: "Framing work",
          amount: 500,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.subcontractorAssignment.findFirst).toHaveBeenCalledWith({
        where: { subcontractorId: "sub-a", projectId: "unassigned-project" },
      });
      expect(prisma.subcontractorCost.create).not.toHaveBeenCalled();
    });

    it("logs a cost scoped to this subcontractor's own companyId/subcontractorId when assigned", async () => {
      prisma.subcontractorAssignment.findFirst.mockResolvedValue({ id: "assign-1" });
      prisma.subcontractorCost.create.mockResolvedValue({ id: "cost-1" });

      await service.submitCost(SUBCONTRACTOR_A, {
        projectId: "assigned-project",
        description: "Framing work",
        amount: 500,
      });

      expect(prisma.subcontractorCost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: "company-a",
            subcontractorId: "sub-a",
            projectId: "assigned-project",
            amount: 500,
          }),
        }),
      );
    });
  });

  describe("signLienWaiver()", () => {
    it("rejects signing a waiver that doesn't belong to this subcontractor", async () => {
      prisma.lienWaiver.findFirst.mockResolvedValue(null);

      await expect(
        service.signLienWaiver(SUBCONTRACTOR_A, "waiver-1", { signerName: "Jane Doe", signatureDataUrl: SIGNATURE_DATA_URL }),
      ).rejects.toThrow(NotFoundException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it("rejects re-signing an already-signed waiver", async () => {
      prisma.lienWaiver.findFirst.mockResolvedValue({ id: "waiver-1", signedAt: new Date() });

      await expect(
        service.signLienWaiver(SUBCONTRACTOR_A, "waiver-1", { signerName: "Jane Doe", signatureDataUrl: SIGNATURE_DATA_URL }),
      ).rejects.toThrow(BadRequestException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it("stores the signature image and marks the waiver signed", async () => {
      prisma.lienWaiver.findFirst.mockResolvedValue({ id: "waiver-1", signedAt: null });
      prisma.lienWaiver.update.mockResolvedValue({ id: "waiver-1", signedAt: new Date(), signerName: "Jane Doe" });

      await service.signLienWaiver(SUBCONTRACTOR_A, "waiver-1", { signerName: "Jane Doe", signatureDataUrl: SIGNATURE_DATA_URL }, "1.2.3.4");

      expect(storage.save).toHaveBeenCalledWith("company-a", "signature.png", expect.any(Buffer));
      expect(prisma.lienWaiver.update).toHaveBeenCalledWith({
        where: { id: "waiver-1" },
        data: expect.objectContaining({ signerName: "Jane Doe", signatureImageKey: "sig-key", signedIp: "1.2.3.4" }),
      });
    });
  });
});
