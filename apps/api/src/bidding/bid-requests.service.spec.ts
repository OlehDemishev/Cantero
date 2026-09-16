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
    company: { findUniqueOrThrow: jest.Mock };
    bidRequest: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    bidRequestLine: { deleteMany: jest.Mock; createMany: jest.Mock; findMany: jest.Mock };
    bid: { findFirst: jest.Mock; update: jest.Mock; upsert: jest.Mock; findUniqueOrThrow: jest.Mock };
    bidLine: { deleteMany: jest.Mock; createMany: jest.Mock };
    bidInvite: { findFirst: jest.Mock };
    bidScoreCriterion: { create: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
    bidScore: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let subcontractors: { assign: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      subcontractor: { findMany: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
      bidRequest: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      bidRequestLine: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
      bid: { findFirst: jest.fn(), update: jest.fn(), upsert: jest.fn(), findUniqueOrThrow: jest.fn() },
      bidLine: { deleteMany: jest.fn(), createMany: jest.fn() },
      bidInvite: { findFirst: jest.fn() },
      bidScoreCriterion: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
      bidScore: { upsert: jest.fn() },
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
        criteria: [],
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

    it("replaces the bid's lines wholesale when lines are given", async () => {
      prisma.bidInvite.findFirst.mockResolvedValue({ bidRequest: { status: "open" } });
      prisma.bid.upsert.mockResolvedValue({ id: "bid-1" });
      prisma.bid.findUniqueOrThrow.mockResolvedValue({ id: "bid-1", lines: [] });

      await service.submitBid(
        { subcontractorId: "sub-1", companyId: COMPANY_A },
        "br-1",
        { amount: 5000, lines: [{ description: "Demo", amount: 2000, included: true }] },
      );

      expect(prisma.bidLine.deleteMany).toHaveBeenCalledWith({ where: { bidId: "bid-1" } });
      expect(prisma.bidLine.createMany).toHaveBeenCalledWith({
        data: [{ bidId: "bid-1", description: "Demo", amount: 2000, included: true, sortOrder: 0 }],
      });
    });

    it("leaves existing lines untouched when no lines are given at all", async () => {
      prisma.bidInvite.findFirst.mockResolvedValue({ bidRequest: { status: "open" } });
      prisma.bid.upsert.mockResolvedValue({ id: "bid-1" });
      prisma.bid.findUniqueOrThrow.mockResolvedValue({ id: "bid-1", lines: [] });

      await service.submitBid({ subcontractorId: "sub-1", companyId: COMPANY_A }, "br-1", { amount: 5000 });

      expect(prisma.bidLine.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("leveling()", () => {
    it("throws when the bid request doesn't belong to the company", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue(null);
      await expect(service.leveling(COMPANY_A, "br-1")).rejects.toThrow(NotFoundException);
    });

    it("aligns bids' scope lines into shared rows", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue({
        id: "br-1",
        bids: [
          {
            id: "bid-1",
            subcontractor: { id: "sub-1", name: "Acme Electric" },
            amount: "5000",
            lines: [{ description: "Demo", amount: "2000", included: true }],
          },
          {
            id: "bid-2",
            subcontractor: { id: "sub-2", name: "Beta Electric" },
            amount: "4500",
            lines: [],
          },
        ],
      });

      const result = await service.leveling(COMPANY_A, "br-1");

      expect(result.bids).toHaveLength(2);
      expect(result.scopeItems[0].byBid["bid-1"]).toEqual({ amount: 2000, included: true });
      expect(result.scopeItems[0].byBid["bid-2"]).toBeNull();
    });
  });

  describe("addCriterion()", () => {
    it("404s on a bid request outside the company", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue(null);
      await expect(service.addCriterion(COMPANY_A, ACTOR, "br-1", { label: "Timeline", weight: 3 })).rejects.toThrow(NotFoundException);
      expect(prisma.bidScoreCriterion.create).not.toHaveBeenCalled();
    });

    it("creates the criterion scoped to the bid request", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue({ id: "br-1", title: "Electrical rough-in" });
      prisma.bidScoreCriterion.create.mockResolvedValue({ id: "crit-1", label: "Timeline", weight: 3 });

      await service.addCriterion(COMPANY_A, ACTOR, "br-1", { label: "Timeline", weight: 3 });

      expect(prisma.bidScoreCriterion.create).toHaveBeenCalledWith({
        data: { bidRequestId: "br-1", label: "Timeline", weight: 3 },
      });
    });
  });

  describe("scoreBid()", () => {
    it("404s when the bid doesn't belong to this bid request/company", async () => {
      prisma.bid.findFirst.mockResolvedValue(null);
      await expect(service.scoreBid(COMPANY_A, ACTOR, "br-1", "bid-1", { criterionId: "crit-1", score: 4 })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.bidScore.upsert).not.toHaveBeenCalled();
    });

    it("404s when the criterion doesn't belong to this bid request", async () => {
      prisma.bid.findFirst.mockResolvedValue({ id: "bid-1" });
      prisma.bidScoreCriterion.findFirst.mockResolvedValue(null);
      await expect(service.scoreBid(COMPANY_A, ACTOR, "br-1", "bid-1", { criterionId: "crit-1", score: 4 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("upserts the score", async () => {
      prisma.bid.findFirst.mockResolvedValue({ id: "bid-1" });
      prisma.bidScoreCriterion.findFirst.mockResolvedValue({ id: "crit-1", label: "Timeline" });
      prisma.bidScore.upsert.mockResolvedValue({ id: "score-1", score: 4 });

      await service.scoreBid(COMPANY_A, ACTOR, "br-1", "bid-1", { criterionId: "crit-1", score: 4 });

      expect(prisma.bidScore.upsert).toHaveBeenCalledWith({
        where: { bidId_criterionId: { bidId: "bid-1", criterionId: "crit-1" } },
        create: { bidId: "bid-1", criterionId: "crit-1", score: 4 },
        update: { score: 4 },
      });
    });
  });

  describe("setLines()", () => {
    it("404s on a bid request outside the company", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue(null);
      await expect(service.setLines(COMPANY_A, ACTOR, "br-1", { lines: [] })).rejects.toThrow(NotFoundException);
      expect(prisma.bidRequestLine.deleteMany).not.toHaveBeenCalled();
    });

    it("replaces the scope lines wholesale", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue({ id: "br-1", title: "Electrical rough-in" });
      prisma.bidRequestLine.findMany.mockResolvedValue([]);

      await service.setLines(COMPANY_A, ACTOR, "br-1", {
        lines: [{ positionNo: "01.010", description: "Conduit", quantity: 150, unit: "m" }],
      });

      expect(prisma.bidRequestLine.deleteMany).toHaveBeenCalledWith({ where: { bidRequestId: "br-1" } });
      expect(prisma.bidRequestLine.createMany).toHaveBeenCalledWith({
        data: [{ bidRequestId: "br-1", positionNo: "01.010", description: "Conduit", quantity: 150, unit: "m", sortOrder: 0 }],
      });
    });
  });

  describe("generateGaebDa83Xml()", () => {
    it("404s on a bid request outside the company", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue(null);
      await expect(service.generateGaebDa83Xml(COMPANY_A, "br-1")).rejects.toThrow(NotFoundException);
    });

    it("rejects when the company is missing e-invoicing-grade address fields", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue({ id: "br-1", title: "Electrical rough-in", lines: [], project: { name: "Site A" } });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Cantero Bau GmbH", address: null, city: null, postalCode: null, country: "DE" });

      await expect(service.generateGaebDa83Xml(COMPANY_A, "br-1")).rejects.toThrow(BadRequestException);
    });

    it("rejects a bid request with no scope lines", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue({ id: "br-1", title: "Electrical rough-in", lines: [], project: { name: "Site A" } });
      prisma.company.findUniqueOrThrow.mockResolvedValue({
        name: "Cantero Bau GmbH",
        address: "Musterstraße 12",
        city: "Berlin",
        postalCode: "10115",
        country: "DE",
      });

      await expect(service.generateGaebDa83Xml(COMPANY_A, "br-1")).rejects.toThrow("scope lines");
    });

    it("builds a GAEB DA83 XML document from the bid request's scope lines", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue({
        id: "br-1",
        title: "Electrical rough-in",
        description: null,
        dueDate: null,
        project: { name: "Site A" },
        lines: [{ positionNo: "01.010", description: "Conduit", quantity: "150", unit: "m" }],
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({
        name: "Cantero Bau GmbH",
        address: "Musterstraße 12",
        city: "Berlin",
        postalCode: "10115",
        country: "DE",
      });

      const { xml, filename } = await service.generateGaebDa83Xml(COMPANY_A, "br-1");

      expect(xml).toContain('<Item RNoPart="01.010">');
      expect(filename).toBe("Electrical rough-in-da83.xml");
    });
  });

  describe("importGaebDa84Bid()", () => {
    const da83Xml = (positionNo: string, qty: string, up: string) => `<?xml version="1.0" encoding="UTF-8"?>
<GAEB><Award><BoQ><BoQBody><Itemlist>
<Item RNoPart="${positionNo}"><Qty>${qty}</Qty><QU>m</QU><UP>${up}</UP><IT></IT>
<Description><OutlineText><OutlTxt><span>Conduit</span></OutlTxt></OutlineText></Description>
</Item>
</Itemlist></BoQBody></BoQ></Award></GAEB>`;

    it("404s when the subcontractor wasn't invited to this bid request", async () => {
      prisma.bidInvite.findFirst.mockResolvedValue(null);
      await expect(service.importGaebDa84Bid(COMPANY_A, ACTOR, "br-1", "sub-1", da83Xml("01.010", "150", "2.5"))).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.bid.upsert).not.toHaveBeenCalled();
    });

    it("rejects an import once the bid request is no longer open", async () => {
      prisma.bidInvite.findFirst.mockResolvedValue({ bidRequest: { status: "awarded", lines: [] }, subcontractor: { name: "ElectroPro" } });
      await expect(service.importGaebDa84Bid(COMPANY_A, ACTOR, "br-1", "sub-1", da83Xml("01.010", "150", "2.5"))).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.bid.upsert).not.toHaveBeenCalled();
    });

    it("rejects unparseable XML with a BadRequestException, not a 500", async () => {
      prisma.bidInvite.findFirst.mockResolvedValue({ bidRequest: { status: "open", lines: [] }, subcontractor: { name: "ElectroPro" } });
      await expect(service.importGaebDa84Bid(COMPANY_A, ACTOR, "br-1", "sub-1", "<not-gaeb/>")).rejects.toThrow(BadRequestException);
    });

    it("matches returned items to scope lines by position number and upserts a priced Bid/BidLine", async () => {
      prisma.bidInvite.findFirst.mockResolvedValue({
        bidRequest: { status: "open", lines: [{ positionNo: "01.010", description: "Conduit, 20mm" }] },
        subcontractor: { name: "ElectroPro" },
      });
      prisma.bid.upsert.mockResolvedValue({ id: "bid-1" });
      prisma.bid.findUniqueOrThrow.mockResolvedValue({ id: "bid-1", lines: [] });

      const result = await service.importGaebDa84Bid(COMPANY_A, ACTOR, "br-1", "sub-1", da83Xml("01.010", "150", "2.5"));

      expect(prisma.bid.upsert).toHaveBeenCalledWith({
        where: { bidRequestId_subcontractorId: { bidRequestId: "br-1", subcontractorId: "sub-1" } },
        create: { bidRequestId: "br-1", subcontractorId: "sub-1", amount: 375 },
        update: { amount: 375, submittedAt: expect.any(Date) },
      });
      expect(prisma.bidLine.createMany).toHaveBeenCalledWith({
        data: [{ bidId: "bid-1", description: "Conduit", amount: 375, positionNo: "01.010", quantity: 150, unitPrice: 2.5, sortOrder: 0 }],
      });
      expect(result.warnings).toEqual([]);
    });

    it("skips a returned position that isn't on the scope list and reports it as a warning", async () => {
      prisma.bidInvite.findFirst.mockResolvedValue({
        bidRequest: { status: "open", lines: [] },
        subcontractor: { name: "ElectroPro" },
      });
      prisma.bid.upsert.mockResolvedValue({ id: "bid-1" });
      prisma.bid.findUniqueOrThrow.mockResolvedValue({ id: "bid-1", lines: [] });

      const result = await service.importGaebDa84Bid(COMPANY_A, ACTOR, "br-1", "sub-1", da83Xml("99.999", "1", "10"));

      expect(prisma.bidLine.createMany).not.toHaveBeenCalled();
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("99.999");
    });
  });

  describe("get()", () => {
    it("attaches a weightedScore to each bid based on its recorded scores", async () => {
      prisma.bidRequest.findFirst.mockResolvedValue({
        id: "br-1",
        project: { name: "Site A" },
        invites: [],
        criteria: [{ id: "crit-1", weight: 5 }],
        bids: [
          { id: "bid-1", amount: 5000, subcontractor: { name: "ElectroPro" }, scores: [{ criterionId: "crit-1", score: 4 }] },
          { id: "bid-2", amount: 4500, subcontractor: { name: "WireWorks" }, scores: [] },
        ],
      });

      const result = await service.get(COMPANY_A, "br-1");

      expect(result.bids[0].weightedScore).toBe(4);
      expect(result.bids[1].weightedScore).toBeNull();
    });
  });
});
