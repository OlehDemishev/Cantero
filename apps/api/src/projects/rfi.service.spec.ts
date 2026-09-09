import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RfiService } from "./rfi.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { OutboxService } from "../common/webhooks/outbox.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Site Manager" };
const projectAccessStub = { assertAccess: jest.fn(), filterAccessible: jest.fn(async (rows: unknown[]) => rows) };

describe("RfiService", () => {
  let service: RfiService;
  let prisma: {
    project: { findFirst: jest.Mock };
    rfi: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock; create: jest.Mock; update: jest.Mock };
    changeOrder: { findFirst: jest.Mock };
    punchListItem: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let outbox: { enqueue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      rfi: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
      changeOrder: { findFirst: jest.fn() },
      punchListItem: { findMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    audit = { record: jest.fn() };
    outbox = { enqueue: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        RfiService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OutboxService, useValue: outbox },
        { provide: ProjectAccessService, useValue: projectAccessStub },
      ],
    }).compile();

    service = module.get(RfiService);
  });

  describe("create()", () => {
    it("rejects when the project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, { projectId: "project-1", subject: "Door swing", question: "Which way does it open?" }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.rfi.create).not.toHaveBeenCalled();
    });

    it("numbers the RFI sequentially per project starting at RFI-001", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
      prisma.rfi.count.mockResolvedValue(4);
      prisma.rfi.create.mockResolvedValue({ id: "rfi-1", number: "RFI-005" });

      await service.create(COMPANY_A, ACTOR, { projectId: "project-1", subject: "Door swing", question: "Which way does it open?" });

      expect(prisma.rfi.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ number: "RFI-005" }) }),
      );
    });
  });

  describe("answer()", () => {
    it("rejects answering a closed RFI", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A, status: "closed", number: "RFI-001", subject: "Door swing" });

      await expect(service.answer(COMPANY_A, ACTOR, "rfi-1", { answer: "Inward" })).rejects.toThrow(BadRequestException);
      expect(prisma.rfi.update).not.toHaveBeenCalled();
    });

    it("triggers the rfi.answered webhook on success", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A, status: "open", number: "RFI-001", subject: "Door swing" });
      prisma.rfi.update.mockResolvedValue({ id: "rfi-1", status: "answered" });

      await service.answer(COMPANY_A, ACTOR, "rfi-1", { answer: "Inward" });

      expect(outbox.enqueue).toHaveBeenCalledWith(prisma, COMPANY_A, "rfi.answered", expect.objectContaining({ rfiId: "rfi-1", number: "RFI-001" }));
    });
  });

  describe("close()", () => {
    it("rejects closing an already-closed RFI", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A, status: "closed", number: "RFI-001", subject: "Door swing" });

      await expect(service.close(COMPANY_A, ACTOR, "rfi-1")).rejects.toThrow(BadRequestException);
      expect(prisma.rfi.update).not.toHaveBeenCalled();
    });

    it("closes an open RFI directly (withdrawn, no answer needed)", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A, status: "open", number: "RFI-001", subject: "Door swing" });
      prisma.rfi.update.mockResolvedValue({ id: "rfi-1", status: "closed" });

      await service.close(COMPANY_A, ACTOR, "rfi-1");

      expect(prisma.rfi.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "closed" }) }));
      expect(outbox.enqueue).toHaveBeenCalledWith(prisma, COMPANY_A, "rfi.closed", expect.objectContaining({ rfiId: "rfi-1" }));
    });
  });

  describe("reopen()", () => {
    it("rejects reopening an RFI that isn't closed", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A, status: "open", number: "RFI-001", subject: "Door swing" });

      await expect(service.reopen(COMPANY_A, ACTOR, "rfi-1")).rejects.toThrow(BadRequestException);
      expect(prisma.rfi.update).not.toHaveBeenCalled();
    });

    it("reopens to 'answered' when an answer already exists, not back to 'open'", async () => {
      prisma.rfi.findFirst.mockResolvedValue({
        id: "rfi-1",
        companyId: COMPANY_A,
        status: "closed",
        answer: "Inward",
        number: "RFI-001",
        subject: "Door swing",
      });
      prisma.rfi.update.mockResolvedValue({ id: "rfi-1", status: "answered" });

      await service.reopen(COMPANY_A, ACTOR, "rfi-1");

      expect(prisma.rfi.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "answered" }) }));
    });
  });

  describe("bulkClose()", () => {
    it("closes every open/answered RFI and reports failures for already-closed ones", async () => {
      const rfis: Record<string, { id: string; companyId: string; status: string; number: string; subject: string }> = {
        "rfi-1": { id: "rfi-1", companyId: COMPANY_A, status: "open", number: "RFI-001", subject: "Door swing" },
        "rfi-2": { id: "rfi-2", companyId: COMPANY_A, status: "closed", number: "RFI-002", subject: "Rebar spacing" },
      };
      prisma.rfi.findFirst.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(rfis[where.id] ?? null));
      prisma.rfi.update.mockResolvedValue({ id: "rfi-1", status: "closed" });

      const result = await service.bulkClose(COMPANY_A, ACTOR, ["rfi-1", "rfi-2"]);

      expect(result.succeeded).toBe(1);
      expect(result.failed).toEqual([{ id: "rfi-2", message: "RFI is already closed" }]);
      expect(prisma.rfi.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("setBallInCourt()", () => {
    it("throws when the RFI doesn't belong to this company", async () => {
      prisma.rfi.findFirst.mockResolvedValue(null);
      await expect(service.setBallInCourt(COMPANY_A, ACTOR, "rfi-1", { ballInCourtParty: "client" })).rejects.toThrow(NotFoundException);
    });

    it("updates the party and records an audit entry", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A, number: "RFI-001" });
      prisma.rfi.update.mockResolvedValue({ id: "rfi-1", ballInCourtParty: "subcontractor" });

      const result = await service.setBallInCourt(COMPANY_A, ACTOR, "rfi-1", { ballInCourtParty: "subcontractor" });

      expect(prisma.rfi.update).toHaveBeenCalledWith({ where: { id: "rfi-1" }, data: { ballInCourtParty: "subcontractor" } });
      expect(result.ballInCourtParty).toBe("subcontractor");
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("listForProject()", () => {
    it("filters by ballInCourtParty when provided", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.rfi.findMany.mockResolvedValue([]);

      await service.listForProject(COMPANY_A, "project-1", "internal");

      expect(prisma.rfi.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: "project-1", ballInCourtParty: "internal" } }),
      );
    });

    it("omits the filter entirely when no party is given", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.rfi.findMany.mockResolvedValue([]);

      await service.listForProject(COMPANY_A, "project-1");

      expect(prisma.rfi.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: "project-1" } }));
    });
  });

  describe("linkChangeOrder()", () => {
    it("rejects a change order that doesn't belong to this company", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A });
      prisma.changeOrder.findFirst.mockResolvedValue(null);

      await expect(service.linkChangeOrder(COMPANY_A, "rfi-1", { changeOrderId: "co-1" })).rejects.toThrow(NotFoundException);
      expect(prisma.rfi.update).not.toHaveBeenCalled();
    });

    it("links a valid change order", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A });
      prisma.changeOrder.findFirst.mockResolvedValue({ id: "co-1", companyId: COMPANY_A });

      await service.linkChangeOrder(COMPANY_A, "rfi-1", { changeOrderId: "co-1" });

      expect(prisma.rfi.update).toHaveBeenCalledWith({ where: { id: "rfi-1" }, data: { changeOrderId: "co-1" } });
    });

    it("unlinks when changeOrderId is null, without checking a change order exists", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A });

      await service.linkChangeOrder(COMPANY_A, "rfi-1", { changeOrderId: null });

      expect(prisma.changeOrder.findFirst).not.toHaveBeenCalled();
      expect(prisma.rfi.update).toHaveBeenCalledWith({ where: { id: "rfi-1" }, data: { changeOrderId: null } });
    });
  });

  describe("costImpactSummary()", () => {
    it("combines RFIs and punch list items into one report", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.rfi.findMany.mockResolvedValue([
        { id: "rfi-1", number: "RFI-001", subject: "Ceiling height", estimatedCostImpact: "500", changeOrder: null },
      ]);
      prisma.punchListItem.findMany.mockResolvedValue([
        { id: "p-1", title: "Fix cracked slab", estimatedCostImpact: "300", changeOrder: { grandTotal: "350" } },
      ]);

      const result = await service.costImpactSummary(COMPANY_A, "project-1");

      expect(result.totalEstimated).toBe(800);
      expect(result.totalConfirmed).toBe(350);
      expect(result.rows).toHaveLength(2);
    });
  });

  describe("analytics()", () => {
    it("throws when the project doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.analytics(COMPANY_A, "project-x")).rejects.toThrow(NotFoundException);
    });

    it("delegates to calculateRfiAnalytics with the project's RFIs", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      const createdAt = new Date();
      prisma.rfi.findMany.mockResolvedValue([
        { id: "rfi-1", number: "RFI-001", status: "open", ballInCourtParty: "client", createdAt, dueDate: null, answeredAt: null },
      ]);

      const result = await service.analytics(COMPANY_A, "project-1");

      expect(result.openCount).toBe(1);
      expect(result.ballInCourtBreakdown).toEqual([{ party: "client", count: 1 }]);
    });
  });

  describe("get() — project access", () => {
    it("checks project access for the RFI's own project when fetched by id", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", projectId: "project-1", companyId: COMPANY_A });

      await service.get(COMPANY_A, "rfi-1", "user-2", "worker");

      expect(projectAccessStub.assertAccess).toHaveBeenCalledWith(COMPANY_A, "project-1", "user-2", "worker");
    });

    it("propagates a rejection from ProjectAccessService instead of returning the RFI", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", projectId: "project-1", companyId: COMPANY_A });
      projectAccessStub.assertAccess.mockRejectedValueOnce(new Error("no access"));

      await expect(service.get(COMPANY_A, "rfi-1", "user-2", "worker")).rejects.toThrow("no access");
    });
  });
});
