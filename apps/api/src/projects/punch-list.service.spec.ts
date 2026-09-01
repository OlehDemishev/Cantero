import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PunchListService } from "./punch-list.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Foreman" };

describe("PunchListService", () => {
  let service: PunchListService;
  let prisma: {
    project: { findFirst: jest.Mock };
    worker: { findFirst: jest.Mock };
    subcontractor: { findFirst: jest.Mock };
    punchListItem: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let webhooks: { trigger: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      worker: { findFirst: jest.fn() },
      subcontractor: { findFirst: jest.fn() },
      punchListItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };
    audit = { record: jest.fn() };
    webhooks = { trigger: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PunchListService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: WebhooksService, useValue: webhooks },
      ],
    }).compile();

    service = module.get(PunchListService);
  });

  describe("create()", () => {
    it("rejects when the project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, { projectId: "project-1", title: "Chipped tile" }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.punchListItem.create).not.toHaveBeenCalled();
    });

    it("rejects when the assignee worker does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, { projectId: "project-1", title: "Chipped tile", assigneeWorkerId: "worker-1" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.punchListItem.create).not.toHaveBeenCalled();
    });

    it("rejects when the assignee subcontractor does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.subcontractor.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, { projectId: "project-1", title: "Chipped tile", assigneeSubcontractorId: "sub-1" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.punchListItem.create).not.toHaveBeenCalled();
    });

    it("creates the item assigned to a subcontractor instead of a worker", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A });
      prisma.punchListItem.create.mockResolvedValue({ id: "item-1" });

      await service.create(COMPANY_A, ACTOR, { projectId: "project-1", title: "Chipped tile", assigneeSubcontractorId: "sub-1" });

      expect(prisma.punchListItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ assigneeSubcontractorId: "sub-1" }) }),
      );
    });
  });

  describe("listForSubcontractor()", () => {
    it("scopes the query to the given subcontractor within the company", async () => {
      prisma.punchListItem.findMany.mockResolvedValue([]);

      await service.listForSubcontractor(COMPANY_A, "sub-1");

      const call = prisma.punchListItem.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ companyId: COMPANY_A, assigneeSubcontractorId: "sub-1" });
    });
  });

  describe("resolve()", () => {
    it("rejects an item that is not open", async () => {
      prisma.punchListItem.findFirst.mockResolvedValue({ id: "item-1", companyId: COMPANY_A, status: "resolved", title: "Chipped tile" });

      await expect(service.resolve(COMPANY_A, ACTOR, "item-1")).rejects.toThrow(BadRequestException);
      expect(prisma.punchListItem.update).not.toHaveBeenCalled();
    });
  });

  describe("verify()", () => {
    it("rejects an item that is not resolved", async () => {
      prisma.punchListItem.findFirst.mockResolvedValue({ id: "item-1", companyId: COMPANY_A, status: "open", title: "Chipped tile" });

      await expect(service.verify(COMPANY_A, ACTOR, "item-1")).rejects.toThrow(BadRequestException);
      expect(prisma.punchListItem.update).not.toHaveBeenCalled();
    });

    it("verifies a resolved item and records who verified it", async () => {
      prisma.punchListItem.findFirst.mockResolvedValue({ id: "item-1", companyId: COMPANY_A, status: "resolved", title: "Chipped tile" });
      prisma.punchListItem.update.mockResolvedValue({ id: "item-1", status: "verified" });

      await service.verify(COMPANY_A, ACTOR, "item-1");

      expect(prisma.punchListItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "verified", verifiedByUserId: "user-1", verifiedByName: "Foreman" }),
        }),
      );
      expect(audit.record).toHaveBeenCalled();
      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "punch_list.verified", expect.objectContaining({ punchListItemId: "item-1" }));
    });
  });

  describe("reopen()", () => {
    it("rejects an item that is already open", async () => {
      prisma.punchListItem.findFirst.mockResolvedValue({ id: "item-1", companyId: COMPANY_A, status: "open", title: "Chipped tile" });

      await expect(service.reopen(COMPANY_A, ACTOR, "item-1")).rejects.toThrow(BadRequestException);
      expect(prisma.punchListItem.update).not.toHaveBeenCalled();
    });
  });

  describe("bulkResolve()", () => {
    it("resolves every valid id and reports failures for the rest without aborting the batch", async () => {
      const items: Record<string, { id: string; companyId: string; status: string; title: string }> = {
        "item-1": { id: "item-1", companyId: COMPANY_A, status: "open", title: "Chipped tile" },
        "item-2": { id: "item-2", companyId: COMPANY_A, status: "resolved", title: "Loose railing" },
        "item-3": { id: "item-3", companyId: COMPANY_A, status: "open", title: "Paint touch-up" },
      };
      prisma.punchListItem.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(items[where.id] ?? null),
      );
      prisma.punchListItem.update.mockResolvedValue({ id: "item-1", status: "resolved" });

      const result = await service.bulkResolve(COMPANY_A, ACTOR, ["item-1", "item-2", "item-3", "missing"]);

      expect(result.succeeded).toBe(2);
      expect(result.failed).toHaveLength(2);
      expect(result.failed.map((f) => f.id).sort()).toEqual(["item-2", "missing"]);
      expect(prisma.punchListItem.update).toHaveBeenCalledTimes(2);
    });
  });
});
