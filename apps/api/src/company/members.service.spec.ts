import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MembersService } from "./members.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "admin-1", name: "Admin" };

describe("MembersService.assignCustomRole", () => {
  let service: MembersService;
  let prisma: {
    membership: { findFirst: jest.Mock; update: jest.Mock };
    customRole: { findFirst: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      membership: { findFirst: jest.fn(), update: jest.fn() },
      customRole: { findFirst: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [MembersService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(MembersService);
  });

  it("throws when the target member doesn't exist in this company", async () => {
    prisma.membership.findFirst.mockResolvedValue(null);

    await expect(service.assignCustomRole(COMPANY_A, ACTOR, "user-1", { customRoleId: "role-1" })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("throws when the custom role doesn't belong to this company", async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: "membership-1", role: "worker" });
    prisma.customRole.findFirst.mockResolvedValue(null);

    await expect(service.assignCustomRole(COMPANY_A, ACTOR, "user-1", { customRoleId: "role-1" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });

  it("assigns the custom role once both the member and role are confirmed", async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: "membership-1", role: "worker" });
    prisma.customRole.findFirst.mockResolvedValue({ id: "role-1", name: "Site Lead", basePermissions: ["foreman"] });
    prisma.membership.update.mockResolvedValue({
      userId: "user-1",
      user: { name: "Jane" },
      customRole: { name: "Site Lead" },
    });

    await service.assignCustomRole(COMPANY_A, ACTOR, "user-1", { customRoleId: "role-1" });

    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "membership-1" }, data: { customRoleId: "role-1" } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      COMPANY_A,
      ACTOR,
      "member.custom_role_assigned",
      "Membership",
      "user-1",
      expect.stringContaining("Site Lead"),
    );
  });

  it("clears the custom role when customRoleId is null, without looking up any role", async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: "membership-1", role: "worker" });
    prisma.membership.update.mockResolvedValue({ userId: "user-1", user: { name: "Jane" }, customRole: null });

    await service.assignCustomRole(COMPANY_A, ACTOR, "user-1", { customRoleId: null });

    expect(prisma.customRole.findFirst).not.toHaveBeenCalled();
    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { customRoleId: null } }),
    );
  });
});

describe("MembersService — only the owner makes or unmakes an admin", () => {
  let service: MembersService;
  let prisma: {
    membership: { findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock };
    customRole: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  const OFFICE = { userId: "office-1", name: "Office manager", role: "accountant" };
  const ADMIN = { userId: "admin-1", name: "Admin", role: "admin" };
  const OWNER = { userId: "owner-1", name: "Owner", role: "owner" };

  beforeEach(async () => {
    prisma = {
      membership: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ userId: "user-1", user: { name: "Jane" }, customRole: null }),
        delete: jest.fn(),
      },
      customRole: { findFirst: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ name: "Jane" }) },
    };
    const module = await Test.createTestingModule({
      providers: [MembersService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: { record: jest.fn() } }],
    }).compile();
    service = module.get(MembersService);
  });

  it("lets a member with settings.roles change ordinary roles", async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: "m-1", role: "worker" });
    await service.updateRole(COMPANY_A, OFFICE, "user-1", { role: "foreman" });
    expect(prisma.membership.update).toHaveBeenCalled();
  });

  it.each([ADMIN, OFFICE])("refuses %s promoting someone to admin", async (actor) => {
    prisma.membership.findFirst.mockResolvedValue({ id: "m-1", role: "worker" });
    await expect(service.updateRole(COMPANY_A, actor, "user-1", { role: "admin" })).rejects.toThrow(ForbiddenException);
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });

  it("refuses demoting or removing an admin unless the owner does it", async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: "m-1", role: "admin" });
    await expect(service.updateRole(COMPANY_A, OFFICE, "user-1", { role: "worker" })).rejects.toThrow(ForbiddenException);
    await expect(service.remove(COMPANY_A, ADMIN, "user-1")).rejects.toThrow(ForbiddenException);
    expect(prisma.membership.delete).not.toHaveBeenCalled();
  });

  it("lets the owner appoint and remove admins", async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: "m-1", role: "worker" });
    await service.updateRole(COMPANY_A, OWNER, "user-1", { role: "admin" });
    prisma.membership.findFirst.mockResolvedValue({ id: "m-1", role: "admin" });
    await service.remove(COMPANY_A, OWNER, "user-1");
    expect(prisma.membership.update).toHaveBeenCalled();
    expect(prisma.membership.delete).toHaveBeenCalled();
  });

  it("treats giving or taking away an admin-based custom role as appointing an admin", async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: "m-1", role: "worker", customRoleId: null });
    prisma.customRole.findFirst.mockResolvedValue({ id: "role-a", name: "Deputy", basePermissions: ["admin"] });
    await expect(service.assignCustomRole(COMPANY_A, OFFICE, "user-1", { customRoleId: "role-a" })).rejects.toThrow(ForbiddenException);

    prisma.membership.findFirst.mockResolvedValue({ id: "m-1", role: "worker", customRoleId: "role-a" });
    await expect(service.assignCustomRole(COMPANY_A, OFFICE, "user-1", { customRoleId: null })).rejects.toThrow(ForbiddenException);
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });
});
