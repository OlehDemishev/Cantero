import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SubcontractorPortalService } from "./subcontractor-portal.service";
import { PrismaService } from "../common/prisma/prisma.service";

const SUBCONTRACTOR_A = { subcontractorId: "sub-a", companyId: "company-a" };

describe("SubcontractorPortalService", () => {
  let service: SubcontractorPortalService;
  let prisma: {
    subcontractorAssignment: { findFirst: jest.Mock };
    subcontractorCost: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      subcontractorAssignment: { findFirst: jest.fn() },
      subcontractorCost: { create: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [SubcontractorPortalService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SubcontractorPortalService);
  });

  describe("submitCost()", () => {
    it("rejects logging a cost against a project this subcontractor isn't assigned to", async () => {
      prisma.subcontractorAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.submitCost(SUBCONTRACTOR_A, {
          projectId: "unassigned-project",
          description: "Framing work",
          amount: 500,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.subcontractorAssignment.findFirst).toHaveBeenCalledWith({
        where: { subcontractorId: "sub-a", projectId: "unassigned-project" },
      });
      expect(prisma.subcontractorCost.create).not.toHaveBeenCalled();
    });

    it("logs a cost scoped to this subcontractor's own companyId/subcontractorId when assigned", async () => {
      prisma.subcontractorAssignment.findFirst.mockResolvedValue({ id: "assign-1" });
      prisma.subcontractorCost.create.mockResolvedValue({ id: "cost-1" });

      await service.submitCost(SUBCONTRACTOR_A, {
        projectId: "assigned-project",
        description: "Framing work",
        amount: 500,
      });

      expect(prisma.subcontractorCost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: "company-a",
            subcontractorId: "sub-a",
            projectId: "assigned-project",
            amount: 500,
          }),
        }),
      );
    });
  });
});
