import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ClientChangeRequestsService } from "./client-change-requests.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("ClientChangeRequestsService", () => {
  let service: ClientChangeRequestsService;
  let prisma: {
    clientChangeRequest: { findFirst: jest.Mock; update: jest.Mock };
    changeOrder: { findFirst: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      clientChangeRequest: { findFirst: jest.fn(), update: jest.fn() },
      changeOrder: { findFirst: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [ClientChangeRequestsService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(ClientChangeRequestsService);
  });

  describe("startReview()", () => {
    it("throws when the request doesn't belong to the company", async () => {
      prisma.clientChangeRequest.findFirst.mockResolvedValue(null);
      await expect(service.startReview(COMPANY_A, ACTOR, "ccr-1")).rejects.toThrow(NotFoundException);
    });

    it("rejects moving an already-reviewed request back to review", async () => {
      prisma.clientChangeRequest.findFirst.mockResolvedValue({ id: "ccr-1", status: "under_review" });
      await expect(service.startReview(COMPANY_A, ACTOR, "ccr-1")).rejects.toThrow(BadRequestException);
    });

    it("moves a submitted request to under_review", async () => {
      prisma.clientChangeRequest.findFirst.mockResolvedValue({ id: "ccr-1", status: "submitted", title: "Add a deck" });
      prisma.clientChangeRequest.update.mockResolvedValue({ id: "ccr-1", status: "under_review" });

      const result = await service.startReview(COMPANY_A, ACTOR, "ccr-1");

      expect(result.status).toBe("under_review");
    });
  });

  describe("convert()", () => {
    it("rejects converting an already-resolved request", async () => {
      prisma.clientChangeRequest.findFirst.mockResolvedValue({ id: "ccr-1", status: "converted" });
      await expect(service.convert(COMPANY_A, ACTOR, "ccr-1", { changeOrderId: "co-1" })).rejects.toThrow(BadRequestException);
    });

    it("throws when the change order isn't on the same project", async () => {
      prisma.clientChangeRequest.findFirst.mockResolvedValue({ id: "ccr-1", status: "under_review", projectId: "project-1" });
      prisma.changeOrder.findFirst.mockResolvedValue(null);
      await expect(service.convert(COMPANY_A, ACTOR, "ccr-1", { changeOrderId: "co-1" })).rejects.toThrow(NotFoundException);
    });

    it("converts and links the change order", async () => {
      prisma.clientChangeRequest.findFirst.mockResolvedValue({ id: "ccr-1", status: "under_review", projectId: "project-1", title: "Add a deck" });
      prisma.changeOrder.findFirst.mockResolvedValue({ id: "co-1", number: 3 });
      prisma.clientChangeRequest.update.mockResolvedValue({ id: "ccr-1", status: "converted", convertedChangeOrderId: "co-1" });

      const result = await service.convert(COMPANY_A, ACTOR, "ccr-1", { changeOrderId: "co-1" });

      expect(result.status).toBe("converted");
      expect(prisma.clientChangeRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ convertedChangeOrderId: "co-1" }) }),
      );
    });
  });

  describe("decline()", () => {
    it("rejects declining an already-resolved request", async () => {
      prisma.clientChangeRequest.findFirst.mockResolvedValue({ id: "ccr-1", status: "declined" });
      await expect(service.decline(COMPANY_A, ACTOR, "ccr-1", { reviewNote: "Out of scope" })).rejects.toThrow(BadRequestException);
    });

    it("declines with a review note", async () => {
      prisma.clientChangeRequest.findFirst.mockResolvedValue({ id: "ccr-1", status: "submitted", title: "Add a deck" });
      prisma.clientChangeRequest.update.mockResolvedValue({ id: "ccr-1", status: "declined" });

      const result = await service.decline(COMPANY_A, ACTOR, "ccr-1", { reviewNote: "Out of scope" });

      expect(result.status).toBe("declined");
    });
  });
});
