import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PunchListService } from "./punch-list.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Foreman" };

describe("PunchListService", () => {
  let service: PunchListService;
  let prisma: {
    project: { findFirst: jest.Mock };
    worker: { findFirst: jest.Mock };
    punchListItem: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      worker: { findFirst: jest.fn() },
      punchListItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PunchListService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
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
    });
  });

  describe("reopen()", () => {
    it("rejects an item that is already open", async () => {
      prisma.punchListItem.findFirst.mockResolvedValue({ id: "item-1", companyId: COMPANY_A, status: "open", title: "Chipped tile" });

      await expect(service.reopen(COMPANY_A, ACTOR, "item-1")).rejects.toThrow(BadRequestException);
      expect(prisma.punchListItem.update).not.toHaveBeenCalled();
    });
  });
});
