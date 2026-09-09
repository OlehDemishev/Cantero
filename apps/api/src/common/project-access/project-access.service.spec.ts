import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ProjectAccessService } from "./project-access.service";
import { PrismaService } from "../prisma/prisma.service";

describe("ProjectAccessService", () => {
  let service: ProjectAccessService;
  let prisma: {
    project: { findFirst: jest.Mock };
    projectMember: { findUnique: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      projectMember: { findUnique: jest.fn(), findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [ProjectAccessService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ProjectAccessService);
  });

  describe("assertAccess()", () => {
    it("skips the check for an internal caller with no userId/role", async () => {
      await service.assertAccess("company-a", "project-1");
      expect(prisma.project.findFirst).not.toHaveBeenCalled();
    });

    it("skips the check for an owner", async () => {
      await service.assertAccess("company-a", "project-1", "user-1", "owner");
      expect(prisma.project.findFirst).not.toHaveBeenCalled();
    });

    it("skips the check for an admin", async () => {
      await service.assertAccess("company-a", "project-1", "user-1", "admin");
      expect(prisma.project.findFirst).not.toHaveBeenCalled();
    });

    it("allows a non-member when the project isn't restricted", async () => {
      prisma.project.findFirst.mockResolvedValue({ restrictedToMembers: false });
      await service.assertAccess("company-a", "project-1", "user-2", "worker");
      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });

    it("allows access when the project can't be found in this company — leaves that to the caller's own lookup", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.assertAccess("company-a", "project-1", "user-2", "worker")).resolves.toBeUndefined();
    });

    it("rejects a non-member worker on a restricted project", async () => {
      prisma.project.findFirst.mockResolvedValue({ restrictedToMembers: true });
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.assertAccess("company-a", "project-1", "user-2", "worker")).rejects.toThrow(ForbiddenException);
    });

    it("allows a member worker on a restricted project", async () => {
      prisma.project.findFirst.mockResolvedValue({ restrictedToMembers: true });
      prisma.projectMember.findUnique.mockResolvedValue({ projectId: "project-1", userId: "user-2" });

      await expect(service.assertAccess("company-a", "project-1", "user-2", "worker")).resolves.toBeUndefined();
    });
  });

  describe("filterAccessible()", () => {
    const OPEN = { id: "p-open", restrictedToMembers: false };
    const RESTRICTED = { id: "p-restricted", restrictedToMembers: true };

    it("returns everything unfiltered for an internal caller", async () => {
      const result = await service.filterAccessible([OPEN, RESTRICTED]);
      expect(result).toEqual([OPEN, RESTRICTED]);
      expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
    });

    it("returns everything unfiltered for an owner/admin", async () => {
      const result = await service.filterAccessible([OPEN, RESTRICTED], "user-1", "owner");
      expect(result).toEqual([OPEN, RESTRICTED]);
    });

    it("drops a restricted project the caller isn't a member of", async () => {
      prisma.projectMember.findMany.mockResolvedValue([]);
      const result = await service.filterAccessible([OPEN, RESTRICTED], "user-2", "worker");
      expect(result).toEqual([OPEN]);
    });

    it("keeps a restricted project the caller is a member of", async () => {
      prisma.projectMember.findMany.mockResolvedValue([{ projectId: "p-restricted" }]);
      const result = await service.filterAccessible([OPEN, RESTRICTED], "user-2", "worker");
      expect(result).toEqual([OPEN, RESTRICTED]);
    });
  });
});
