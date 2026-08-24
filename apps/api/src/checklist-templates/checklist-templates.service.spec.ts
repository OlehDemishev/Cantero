import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ChecklistTemplatesService } from "./checklist-templates.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { PunchListService } from "../projects/punch-list.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("ChecklistTemplatesService", () => {
  let service: ChecklistTemplatesService;
  let prisma: {
    checklistTemplate: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    checklistTemplateItem: { deleteMany: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let punchList: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      checklistTemplate: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      checklistTemplateItem: { deleteMany: jest.fn() },
    };
    audit = { record: jest.fn() };
    punchList = { create: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ChecklistTemplatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: PunchListService, useValue: punchList },
      ],
    }).compile();

    service = module.get(ChecklistTemplatesService);
  });

  describe("create()", () => {
    it("creates a punch list template with ordered items and records an audit entry", async () => {
      prisma.checklistTemplate.create.mockResolvedValue({ id: "tpl-1", name: "Pre-drywall inspection", type: "punch_list", items: [] });

      await service.create(COMPANY_A, ACTOR, {
        type: "punch_list",
        name: "Pre-drywall inspection",
        items: [{ title: "Check outlets" }, { title: "Check insulation" }],
      });

      expect(prisma.checklistTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: { create: [{ title: "Check outlets", sortOrder: 0 }, { title: "Check insulation", sortOrder: 1 }] },
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("update()", () => {
    it("replaces existing items when new items are provided", async () => {
      prisma.checklistTemplate.findFirst.mockResolvedValue({ id: "tpl-1", companyId: COMPANY_A, items: [] });
      prisma.checklistTemplate.update.mockResolvedValue({ id: "tpl-1" });

      await service.update(COMPANY_A, "tpl-1", { items: [{ title: "New item" }] });

      expect(prisma.checklistTemplateItem.deleteMany).toHaveBeenCalledWith({ where: { templateId: "tpl-1" } });
      expect(prisma.checklistTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ items: { create: [{ title: "New item", sortOrder: 0 }] } }) }),
      );
    });
  });

  describe("delete()", () => {
    it("rejects deleting a template that doesn't belong to this company", async () => {
      prisma.checklistTemplate.findFirst.mockResolvedValue(null);

      await expect(service.delete(COMPANY_A, "tpl-1")).rejects.toThrow(NotFoundException);
      expect(prisma.checklistTemplate.delete).not.toHaveBeenCalled();
    });
  });

  describe("apply()", () => {
    it("rejects applying a non-punch_list template", async () => {
      prisma.checklistTemplate.findFirst.mockResolvedValue({ id: "tpl-1", companyId: COMPANY_A, type: "rfi", items: [] });

      await expect(service.apply(COMPANY_A, ACTOR, "tpl-1", "project-1")).rejects.toThrow(BadRequestException);
      expect(punchList.create).not.toHaveBeenCalled();
    });

    it("creates one punch list item per template item, tolerant of individual failures", async () => {
      prisma.checklistTemplate.findFirst.mockResolvedValue({
        id: "tpl-1",
        companyId: COMPANY_A,
        type: "punch_list",
        name: "Pre-drywall inspection",
        items: [
          { id: "item-1", title: "Check outlets", description: null, location: null },
          { id: "item-2", title: "Check insulation", description: null, location: null },
        ],
      });
      punchList.create.mockResolvedValueOnce({ id: "punch-1" }).mockRejectedValueOnce(new Error("Project not found"));

      const result = await service.apply(COMPANY_A, ACTOR, "tpl-1", "project-1");

      expect(result.succeeded).toBe(1);
      expect(result.failed).toEqual([{ id: "item-2", message: "Project not found" }]);
      expect(punchList.create).toHaveBeenCalledTimes(2);
      expect(punchList.create).toHaveBeenCalledWith(COMPANY_A, ACTOR, {
        projectId: "project-1",
        title: "Check outlets",
        description: undefined,
        location: undefined,
      });
    });
  });
});
