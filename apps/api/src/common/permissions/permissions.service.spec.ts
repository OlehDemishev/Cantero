import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { DEFAULT_GRANTS, PERMISSION_KEYS, effectivePermissions } from "@cantero/shared";
import { PermissionsService } from "./permissions.service";

describe("effectivePermissions (the shared rule the API and web app both use)", () => {
  it("climbs the ladder: each role holds what its work needs, a worker nothing financial", () => {
    expect([...effectivePermissions("worker")]).toEqual(["projects.all"]);
    const foreman = effectivePermissions("foreman");
    expect(foreman.has("site.manage")).toBe(true);
    expect(foreman.has("site.crewTime")).toBe(true);
    expect(foreman.has("finance.view")).toBe(false);
    expect(foreman.has("estimates.view")).toBe(false);
    expect(effectivePermissions("estimator").has("estimates.manage")).toBe(true);
    expect(effectivePermissions("accountant").has("finance.manage")).toBe(true);
    expect(effectivePermissions("admin").size).toBe(PERMISSION_KEYS.length);
  });

  it("applies a company's grants and revocations to that role only", () => {
    const overrides = [
      { role: "foreman" as const, permission: "costing.view" as const, granted: true },
      { role: "foreman" as const, permission: "site.crewTime" as const, granted: false },
    ];
    const foreman = effectivePermissions("foreman", overrides);
    expect(foreman.has("costing.view")).toBe(true);
    expect(foreman.has("site.crewTime")).toBe(false);
    expect(effectivePermissions("estimator", overrides).has("costing.view")).toBe(true); // its own default
    expect(effectivePermissions("worker", overrides).has("costing.view")).toBe(false);
  });

  it("never lets an override take anything from the owner", () => {
    const owner = effectivePermissions("owner", [{ role: "owner", permission: "settings.roles", granted: false }]);
    expect(owner.has("settings.roles")).toBe(true);
  });

  it("adds a custom role's base roles and extra capabilities, ignoring unknown ones", () => {
    const custom = effectivePermissions("worker", [], { baseRoles: ["foreman"], extra: ["costing.view", "not.a.permission"] });
    expect(custom.has("site.manage")).toBe(true);
    expect(custom.has("costing.view")).toBe(true);
    expect([...custom]).not.toContain("not.a.permission");
  });
});

describe("PermissionsService", () => {
  let prisma: any;
  let audit: { record: jest.Mock };
  let service: PermissionsService;
  const owner = { userId: "u-owner", name: "Owner", role: "owner" };
  const admin = { userId: "u-admin", name: "Admin", role: "admin" };

  beforeEach(() => {
    prisma = {
      rolePermissionOverride: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    audit = { record: jest.fn() };
    service = new PermissionsService(prisma, audit as never);
  });

  it("stores only a difference from the default, and removes the row when set back to it", async () => {
    await service.setGrant("co", admin, "foreman", "costing.view", true);
    expect(prisma.rolePermissionOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ companyId: "co", role: "foreman", permission: "costing.view", granted: true }) }),
    );
    await service.setGrant("co", admin, "foreman", "site.manage", true);
    expect(prisma.rolePermissionOverride.deleteMany).toHaveBeenCalledWith({ where: { companyId: "co", role: "foreman", permission: "site.manage" } });
    expect(audit.record).toHaveBeenCalledTimes(2);
  });

  it("refuses to change the owner, an unknown capability, or an admin unless the owner asks", async () => {
    await expect(service.setGrant("co", admin, "owner", "finance.view", false)).rejects.toThrow(BadRequestException);
    await expect(service.setGrant("co", admin, "worker", "made.up", true)).rejects.toThrow(BadRequestException);
    await expect(service.setGrant("co", admin, "admin", "finance.view", false)).rejects.toThrow(ForbiddenException);
    await expect(service.setGrant("co", owner, "admin", "finance.view", false)).resolves.toMatchObject({ granted: false, isDefault: false });
  });

  it("serves a company's overrides from memory, and re-reads them after a change", async () => {
    prisma.rolePermissionOverride.findMany.mockResolvedValue([{ role: "worker", permission: "costing.view", granted: true }]);
    expect(await service.effectiveFor("co", "worker")).toContain("costing.view");
    await service.effectiveFor("co", "worker");
    expect(prisma.rolePermissionOverride.findMany).toHaveBeenCalledTimes(1);
    await service.setGrant("co", admin, "worker", "costing.view", false);
    await service.effectiveFor("co", "worker");
    expect(prisma.rolePermissionOverride.findMany).toHaveBeenCalledTimes(2);
  });

  it("marks each cell of the matrix as default or changed", async () => {
    prisma.rolePermissionOverride.findMany.mockResolvedValue([{ role: "foreman", permission: "costing.view", granted: true }]);
    const rows = await service.matrix("co");
    expect(rows).toHaveLength(Object.keys(DEFAULT_GRANTS).length * PERMISSION_KEYS.length);
    expect(rows.find((r) => r.role === "foreman" && r.permission === "costing.view")).toEqual({ role: "foreman", permission: "costing.view", granted: true, isDefault: false });
    expect(rows.find((r) => r.role === "foreman" && r.permission === "site.manage")).toMatchObject({ granted: true, isDefault: true });
  });

  it("resets a role, and keeps an admin from resetting the admin role", async () => {
    await service.resetToDefaults("co", admin, "foreman");
    expect(prisma.rolePermissionOverride.deleteMany).toHaveBeenCalledWith({ where: { companyId: "co", role: "foreman" } });
    await service.resetToDefaults("co", admin);
    expect(prisma.rolePermissionOverride.deleteMany).toHaveBeenLastCalledWith({ where: { companyId: "co", role: { not: "admin" } } });
    await expect(service.resetToDefaults("co", admin, "admin")).rejects.toThrow(ForbiddenException);
  });
});
