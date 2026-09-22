import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CustomFieldsService } from "./custom-fields.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { ForbiddenException } from "@nestjs/common";
import { ProjectAccessService } from "../common/project-access/project-access.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("CustomFieldsService", () => {
  let service: CustomFieldsService;
  let prisma: {
    customFieldDefinition: { count: jest.Mock; create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; delete: jest.Mock };
    customFieldValue: { upsert: jest.Mock };
    project: { findFirst: jest.Mock };
    client: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };

  let projectAccess: { assertAccess: jest.Mock };

  beforeEach(async () => {
    projectAccess = { assertAccess: jest.fn() };
    prisma = {
      customFieldDefinition: { count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
      customFieldValue: { upsert: jest.fn() },
      project: { findFirst: jest.fn() },
      client: { findFirst: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CustomFieldsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: ProjectAccessService, useValue: projectAccess },
      ],
    }).compile();

    service = module.get(CustomFieldsService);
  });

  describe("createDefinition()", () => {
    it("rejects a select field with no options", async () => {
      await expect(
        service.createDefinition(COMPANY_A, ACTOR, { entityType: "project", name: "Region", type: "select", options: [] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.customFieldDefinition.create).not.toHaveBeenCalled();
    });

    it("assigns the next sortOrder after the current count of fields for that entity type", async () => {
      prisma.customFieldDefinition.count.mockResolvedValue(3);
      prisma.customFieldDefinition.create.mockResolvedValue({ id: "field-1" });

      await service.createDefinition(COMPANY_A, ACTOR, { entityType: "project", name: "Bid number", type: "text" });

      expect(prisma.customFieldDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sortOrder: 3, options: [] }) }),
      );
    });
  });

  describe("getValues() / setValues()", () => {
    it("rejects when the entity doesn't belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.getValues(COMPANY_A, "project", "project-x")).rejects.toThrow(NotFoundException);
    });

    it("merges every definition with this entity's stored value, defaulting to null when unset", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        { id: "field-1", name: "Region", type: "text", options: [], values: [{ value: "North" }] },
        { id: "field-2", name: "Priority", type: "select", options: ["low", "high"], values: [] },
      ]);

      const result = await service.getValues(COMPANY_A, "project", "project-1");

      expect(result).toEqual([
        { fieldId: "field-1", name: "Region", type: "text", options: [], value: "North" },
        { fieldId: "field-2", name: "Priority", type: "select", options: ["low", "high"], value: null },
      ]);
    });

    it("rejects setting a value for a field that doesn't belong to this company/entity type", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.customFieldDefinition.findMany.mockResolvedValueOnce([]);

      await expect(
        service.setValues(COMPANY_A, "project", "project-1", { values: [{ fieldId: "field-x", value: "North" }] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("applies the restricted-project check to a project's values, read and write", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      projectAccess.assertAccess.mockRejectedValue(new ForbiddenException());
      const worker = { userId: "u1", role: "worker" };

      await expect(service.getValues(COMPANY_A, "project", "project-1", worker)).rejects.toThrow(ForbiddenException);
      await expect(service.setValues(COMPANY_A, "project", "project-1", { values: [] }, worker)).rejects.toThrow(ForbiddenException);
      expect(projectAccess.assertAccess).toHaveBeenCalledWith(COMPANY_A, "project-1", "u1", "worker");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("doesn't ask about a client's values", async () => {
      prisma.client.findFirst.mockResolvedValue({ id: "client-1" });
      prisma.customFieldDefinition.findMany.mockResolvedValue([]);

      await service.getValues(COMPANY_A, "client", "client-1", { userId: "u1", role: "worker" });
      expect(projectAccess.assertAccess).not.toHaveBeenCalled();
    });
  });
});
