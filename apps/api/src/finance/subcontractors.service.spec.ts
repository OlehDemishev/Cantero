import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SubcontractorsService } from "./subcontractors.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("SubcontractorsService", () => {
  let service: SubcontractorsService;
  let prisma: {
    subcontractor: { findFirst: jest.Mock };
    project: { findFirst: jest.Mock };
    subcontractorAssignment: { upsert: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      subcontractor: { findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
      subcontractorAssignment: { upsert: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [SubcontractorsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SubcontractorsService);
  });

  describe("assign()", () => {
    it("rejects a subcontractorId that belongs to another company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue(null);

      await expect(service.assign(COMPANY_A, "foreign-sub", "project-1")).rejects.toThrow(NotFoundException);
      expect(prisma.subcontractorAssignment.upsert).not.toHaveBeenCalled();
    });

    it("rejects a projectId that belongs to another company", async () => {
      prisma.subcontractor.findFirst.mockResolvedValue({ id: "sub-1", companyId: COMPANY_A });
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.assign(COMPANY_A, "sub-1", "foreign-project")).rejects.toThrow(NotFoundException);
      expect(prisma.subcontractorAssignment.upsert).not.toHaveBeenCalled();
    });
  });

  describe("unassign()", () => {
    it("rejects an assignment that doesn't belong to this company's subcontractor", async () => {
      prisma.subcontractorAssignment.findFirst.mockResolvedValue(null);

      await expect(service.unassign(COMPANY_A, "sub-1", "foreign-assignment")).rejects.toThrow(NotFoundException);
      expect(prisma.subcontractorAssignment.delete).not.toHaveBeenCalled();
    });
  });
});
