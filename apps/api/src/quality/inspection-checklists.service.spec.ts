import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { InspectionChecklistsService } from "./inspection-checklists.service";
import { DeficienciesService } from "./deficiencies.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Inspector" };

describe("InspectionChecklistsService", () => {
  let service: InspectionChecklistsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    worker: { findFirst: jest.Mock };
    inspectionTemplate: { findFirst: jest.Mock };
    inspectionChecklist: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    inspectionChecklistItem: { update: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let deficiencies: { createFromItem: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: "p-1", companyId: COMPANY_A }) },
      worker: { findFirst: jest.fn() },
      inspectionTemplate: { findFirst: jest.fn() },
      inspectionChecklist: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      inspectionChecklistItem: { update: jest.fn() },
    };
    audit = { record: jest.fn() };
    deficiencies = { createFromItem: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        InspectionChecklistsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: DeficienciesService, useValue: deficiencies },
      ],
    }).compile();

    service = module.get(InspectionChecklistsService);
  });

  describe("create()", () => {
    it("clones item descriptions from the template when templateId is given", async () => {
      prisma.inspectionTemplate.findFirst.mockResolvedValue({
        id: "tpl-1",
        items: [{ description: "Check GFCI outlets" }, { description: "Check panel labeling" }],
      });
      prisma.inspectionChecklist.create.mockResolvedValue({ id: "chk-1", items: [] });

      await service.create(COMPANY_A, ACTOR, { projectId: "p-1", templateId: "tpl-1", name: "Electrical rough-in", trade: "Electrical" });

      expect(prisma.inspectionChecklist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: { create: [{ description: "Check GFCI outlets", sortOrder: 0 }, { description: "Check panel labeling", sortOrder: 1 }] },
          }),
        }),
      );
    });

    it("uses the ad-hoc items list when no templateId is given", async () => {
      prisma.inspectionChecklist.create.mockResolvedValue({ id: "chk-1", items: [] });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "p-1",
        name: "Framing walkthrough",
        trade: "Framing",
        items: [{ description: "Check stud spacing" }],
      });

      expect(prisma.inspectionChecklist.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ items: { create: [{ description: "Check stud spacing", sortOrder: 0 }] } }) }),
      );
    });

    it("rejects when neither a template nor any ad-hoc items are given", async () => {
      await expect(service.create(COMPANY_A, ACTOR, { projectId: "p-1", name: "Empty", trade: "Framing" })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.inspectionChecklist.create).not.toHaveBeenCalled();
    });

    it("rejects an unknown templateId", async () => {
      prisma.inspectionTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, { projectId: "p-1", templateId: "missing", name: "X", trade: "Electrical" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("complete()", () => {
    it("marks the inspection failed when any item still has a fail result", async () => {
      prisma.inspectionChecklist.findFirst.mockResolvedValue({
        id: "chk-1",
        status: "open",
        items: [{ id: "i-1", result: "pass" }, { id: "i-2", result: "fail" }],
      });
      prisma.inspectionChecklist.update.mockResolvedValue({ id: "chk-1", status: "failed", items: [] });

      await service.complete(COMPANY_A, ACTOR, "chk-1");

      expect(prisma.inspectionChecklist.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }),
      );
    });

    it("marks the inspection passed when no item failed — pending/na items don't block a pass", async () => {
      prisma.inspectionChecklist.findFirst.mockResolvedValue({
        id: "chk-1",
        status: "open",
        items: [{ id: "i-1", result: "pass" }, { id: "i-2", result: "na" }, { id: "i-3", result: "pending" }],
      });
      prisma.inspectionChecklist.update.mockResolvedValue({ id: "chk-1", status: "passed", items: [] });

      await service.complete(COMPANY_A, ACTOR, "chk-1");

      expect(prisma.inspectionChecklist.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "passed" }) }),
      );
    });

    it("rejects completing an already-completed inspection", async () => {
      prisma.inspectionChecklist.findFirst.mockResolvedValue({ id: "chk-1", status: "passed", items: [] });

      await expect(service.complete(COMPANY_A, ACTOR, "chk-1")).rejects.toThrow(BadRequestException);
      expect(prisma.inspectionChecklist.update).not.toHaveBeenCalled();
    });
  });
});
