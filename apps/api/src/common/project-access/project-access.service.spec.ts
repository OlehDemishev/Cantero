import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ProjectAccessService } from "./project-access.service";
import { PrismaService } from "../prisma/prisma.service";

describe("ProjectAccessService", () => {
  let service: ProjectAccessService;
  let prisma: {
    project: { findFirst: jest.Mock; findMany: jest.Mock };
    projectMember: { findUnique: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
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

  describe("hiddenProjectIds() / visibleWhere()", () => {
    it("hides restricted projects the caller isn't a member of, within their company", async () => {
      prisma.project.findMany.mockResolvedValue([{ id: "p-secret" }]);
      expect(await service.hiddenProjectIds("company-a", "user-2", "worker")).toEqual(["p-secret"]);
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: { companyId: "company-a", restrictedToMembers: true, members: { none: { userId: "user-2" } } },
        select: { id: true },
      });
      expect(await service.visibleWhere("company-a", "DailyLog", "user-2", "worker")).toEqual({ projectId: { notIn: ["p-secret"] } });
    });

    it("hides nothing, without a query, from an owner, an admin or an internal caller", async () => {
      expect(await service.hiddenProjectIds("company-a", "user-1", "owner")).toEqual([]);
      expect(await service.hiddenProjectIds("company-a", "user-1", "admin")).toEqual([]);
      expect(await service.hiddenProjectIds("company-a")).toEqual([]);
      expect(prisma.project.findMany).not.toHaveBeenCalled();
    });

    it("adds no condition when nothing is hidden", async () => {
      expect(await service.visibleWhere("company-a", "DailyLog", "user-2", "worker")).toEqual({});
    });
  });

  describe("only their own projects (projects.all revoked)", () => {
    let own: ProjectAccessService;
    let permissions: { effectiveFor: jest.Mock };
    beforeEach(() => {
      permissions = { effectiveFor: jest.fn().mockResolvedValue([]) };
      Object.assign(prisma, {
        membership: { findUnique: jest.fn().mockResolvedValue({ customRole: null }) },
        resourceAssignment: { findMany: jest.fn().mockResolvedValue([{ projectId: "p-assigned" }]) },
      });
      prisma.projectMember.findMany.mockResolvedValue([{ projectId: "p-member" }]);
      own = new ProjectAccessService(prisma as never, permissions as never);
    });

    it("counts projects they're a member of or assigned to as theirs", async () => {
      expect(await own.ownProjectScope("company-a", "user-2", "worker")).toEqual(new Set(["p-member", "p-assigned"]));
    });

    it("refuses any other project of the company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p-other", restrictedToMembers: false });
      await expect(own.assertAccess("company-a", "p-other", "user-2", "worker")).rejects.toThrow(ForbiddenException);
      prisma.project.findFirst.mockResolvedValue({ id: "p-assigned", restrictedToMembers: false });
      await expect(own.assertAccess("company-a", "p-assigned", "user-2", "worker")).resolves.toBeUndefined();
    });

    it("changes nothing while the role has projects.all, the default", async () => {
      permissions.effectiveFor.mockResolvedValue(["projects.all"]);
      expect(await own.ownProjectScope("company-a", "user-2", "worker")).toBeNull();
      expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
    });
  });
});
