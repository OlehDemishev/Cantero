import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { BidRequestsService } from "./bid-requests.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { SubcontractorsService } from "../finance/subcontractors.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("BidRequestsService", () => {
  let service: BidRequestsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    subcontractor: { findMany: jest.Mock };
    bidRequest: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    bid: { findFirst: jest.Mock; update: jest.Mock; upsert: jest.Mock };
    bidInvite: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let subcontractors: { assign: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      subcontractor: { findMany: jest.fn() },
      bidRequest: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      bid: { findFirst: jest.fn(), update: jest.fn(), upsert: jest.fn() },
      bidInvite: { findFirst: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    audit = { record: jest.fn() };
    subcontractors = { assign: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        BidRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: SubcontractorsService, useValue: subcontractors },
      ],
    }).compile();

    service = module.get(BidRequestsService);
  });

  describe("create()", () => {
    it("rejects when a subcontractor id in the invite list doesn't belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Site A" });
      prisma.subcontractor.findMany.mockResolvedValue([{ id: "sub-1" }]);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          title: "Electrical rough-in",
          subcontractorIds: ["sub-1", "sub-2"],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bidRequest.create).not.toHaveBeenCalled();
    });
  });

  describe("award()", () => {
    it("rejects awarding a bid request that's already closed", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue({ id: "br-1", status: "awarded", projectId: "project-1" });

      await expect(service.award(COMPANY_A, ACTOR, "br-1", "bid-1")).rejects.toThrow(BadRequestException);
      expect(subcontractors.assign).not.toHaveBeenCalled();
    });

    it("rejects a bid id that doesn't belong to this bid request", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue({ id: "br-1", status: "open", projectId: "project-1" });
      prisma.bid.findFirst.mockResolvedValue(null);

      await expect(service.award(COMPANY_A, ACTOR, "br-1", "bid-1")).rejects.toThrow(NotFoundException);
      expect(subcontractors.assign).not.toHaveBeenCalled();
    });

    it("creates the assignment through SubcontractorsService.assign (so the compliance gate still applies) and closes the request", async () => {
      prisma.bid.findFirst.mockResolvedValue({
        id: "bid-1",
        subcontractorId: "sub-1",
        amount: 5000,
        subcontractor: { name: "ElectroPro" },
      });
      prisma.bidRequest.findFirst.mockResolvedValueOnce({ id: "br-1", status: "open", projectId: "project-1", title: "Electrical rough-in" });
      prisma.bidRequest.findFirst.mockResolvedValueOnce({
        id: "br-1",
        status: "awarded",
        projectId: "project-1",
        invites: [],
        bids: [],
        project: { name: "Site A" },
      });

      await service.award(COMPANY_A, ACTOR, "br-1", "bid-1");

      expect(subcontractors.assign).toHaveBeenCalledWith(COMPANY_A, "sub-1", "project-1");
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("propagates a compliance-gate rejection from SubcontractorsService.assign without closing the request", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue({ id: "br-1", status: "open", projectId: "project-1", title: "Electrical rough-in" });
      prisma.bid.findFirst.mockResolvedValue({
        id: "bid-1",
        subcontractorId: "sub-1",
        amount: 5000,
        subcontractor: { name: "ElectroPro" },
      });
      subcontractors.assign.mockRejectedValue(new BadRequestException("Insurance expired"));

      await expect(service.award(COMPANY_A, ACTOR, "br-1", "bid-1")).rejects.toThrow("Insurance expired");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("submitBid()", () => {
    it("rejects a bid from a subcontractor who wasn't invited", async () => {
      prisma.bidInvite.findFirst.mockResolvedValue(null);

      await expect(
        service.submitBid({ subcontractorId: "sub-1", companyId: COMPANY_A }, "br-1", { amount: 5000 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.bid.upsert).not.toHaveBeenCalled();
    });

    it("rejects a bid submitted after the request has been awarded or cancelled", async () => {
      prisma.bidInvite.findFirst.mockResolvedValue({ bidRequest: { status: "awarded" } });

      await expect(
        service.submitBid({ subcontractorId: "sub-1", companyId: COMPANY_A }, "br-1", { amount: 5000 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bid.upsert).not.toHaveBeenCalled();
    });
  });
});
