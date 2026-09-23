import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CustomRolesService } from "./custom-roles.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Jane" };

describe("CustomRolesService", () => {
  let service: CustomRolesService;
  let prisma: { customRole: { create: jest.Mock; findFirst: jest.Mock; delete: jest.Mock; findMany: jest.Mock } };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = { customRole: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn(), findMany: jest.fn() } };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [CustomRolesService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(CustomRolesService);
  });

  it("creates a custom role composed of multiple base permission tiers", async () => {
    prisma.customRole.create.mockResolvedValue({ id: "role-1", name: "Site Lead", basePermissions: ["foreman", "estimator"] });

    const result = await service.create(COMPANY_A, ACTOR, { name: "Site Lead", basePermissions: ["foreman", "estimator"] });

    expect(result.name).toBe("Site Lead");
    expect(prisma.customRole.create).toHaveBeenCalledWith({
      data: { companyId: COMPANY_A, name: "Site Lead", basePermissions: ["foreman", "estimator"], extraPermissions: [] },
    });
  });

  it("stores the capabilities a custom role adds on top of its base roles", async () => {
    prisma.customRole.create.mockResolvedValue({ id: "role-2", name: "Site Lead+", basePermissions: ["foreman"] });
    await service.create(COMPANY_A, ACTOR, { name: "Site Lead+", basePermissions: ["foreman"], extraPermissions: ["costing.view"] });
    expect(prisma.customRole.create).toHaveBeenCalledWith({
      data: { companyId: COMPANY_A, name: "Site Lead+", basePermissions: ["foreman"], extraPermissions: ["costing.view"] },
    });
  });

  it("surfaces a clear error when the role name is already taken in this company", async () => {
    prisma.customRole.create.mockRejectedValue({ code: "P2002" });

    await expect(service.create(COMPANY_A, ACTOR, { name: "Site Lead", basePermissions: ["foreman"] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws when deleting a role that doesn't belong to this company", async () => {
    prisma.customRole.findFirst.mockResolvedValue(null);

    await expect(service.delete(COMPANY_A, ACTOR, "role-1")).rejects.toThrow(NotFoundException);
    expect(prisma.customRole.delete).not.toHaveBeenCalled();
  });

  it("deletes a role that belongs to this company", async () => {
    prisma.customRole.findFirst.mockResolvedValue({ id: "role-1", name: "Site Lead", basePermissions: ["foreman"] });

    const result = await service.delete(COMPANY_A, ACTOR, "role-1");

    expect(result).toEqual({ ok: true });
    expect(prisma.customRole.delete).toHaveBeenCalledWith({ where: { id: "role-1" } });
  });

  it("leaves admin-based custom roles to the owner, creating or deleting", async () => {
    const admin = { userId: "admin-1", name: "Admin", role: "admin" };
    await expect(service.create(COMPANY_A, admin, { name: "Deputy", basePermissions: ["admin"] })).rejects.toThrow(ForbiddenException);
    prisma.customRole.findFirst.mockResolvedValue({ id: "role-2", name: "Deputy", basePermissions: ["admin"] });
    await expect(service.delete(COMPANY_A, admin, "role-2")).rejects.toThrow(ForbiddenException);
    expect(prisma.customRole.create).not.toHaveBeenCalled();
    expect(prisma.customRole.delete).not.toHaveBeenCalled();

    prisma.customRole.create.mockResolvedValue({ id: "role-3", name: "Deputy", basePermissions: ["admin"] });
    await service.create(COMPANY_A, { userId: "owner-1", name: "Owner", role: "owner" }, { name: "Deputy", basePermissions: ["admin"] });
    expect(prisma.customRole.create).toHaveBeenCalled();
  });
});
