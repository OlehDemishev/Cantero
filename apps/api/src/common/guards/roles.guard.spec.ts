import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import { REQUIRES_KEY, type Requirement } from "../decorators/permissions.decorator";

function makeContext(
  role: string | undefined,
  requiredRoles: string[] | undefined,
  additionalRoles?: string[],
  openReason?: string,
  extra: { requirement?: Requirement; permissions?: string[]; method?: string } = {},
) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => (key === REQUIRES_KEY ? extra.requirement : requiredRoles)),
    get: jest.fn().mockReturnValue(openReason),
  } as unknown as Reflector;
  const user = role ? { role, additionalRoles, permissions: extra.permissions } : undefined;
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user, method: extra.method ?? "GET" }) }),
  } as unknown as ExecutionContext;
  return { reflector, context };
}

describe("RolesGuard", () => {
  it("blocks a worker from an owner/admin-restricted route", () => {
    const { reflector, context } = makeContext("worker", ["owner", "admin"]);
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("allows an admin through an owner/admin-restricted route", () => {
    const { reflector, context } = makeContext("admin", ["owner", "admin"]);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows any authenticated role when no @Roles metadata is present", () => {
    const { reflector, context } = makeContext("worker", undefined);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows a worker with an additional accountant permission tier through an accountant-restricted route", () => {
    const { reflector, context } = makeContext("worker", ["owner", "admin", "accountant"], ["accountant"]);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("still blocks a worker whose additional roles don't cover the required tier", () => {
    const { reflector, context } = makeContext("worker", ["owner", "admin"], ["accountant"]);
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("ignores additionalRoles entirely when absent, matching pre-custom-role behavior exactly", () => {
    const { reflector, context } = makeContext("worker", ["owner", "admin"]);
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("lets anyone through a handler marked @OpenToAllRoles inside a restricted controller", () => {
    const { reflector, context } = makeContext("worker", ["owner", "admin"], undefined, "a site action");
    expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
  });

  describe("@Requires", () => {
    it("lets a member with the capability through, and refuses one without", () => {
      const allowed = makeContext("foreman", undefined, undefined, undefined, { requirement: "site.manage", permissions: ["site.manage"] });
      expect(new RolesGuard(allowed.reflector).canActivate(allowed.context)).toBe(true);
      const refused = makeContext("worker", undefined, undefined, undefined, { requirement: "site.manage", permissions: ["projects.all"] });
      expect(() => new RolesGuard(refused.reflector).canActivate(refused.context)).toThrow(ForbiddenException);
    });

    it("asks for the read capability on GET and the write one otherwise", () => {
      const requirement = { read: "finance.view", write: "finance.manage" } as const;
      const read = makeContext("estimator", undefined, undefined, undefined, { requirement, permissions: ["finance.view"], method: "GET" });
      expect(new RolesGuard(read.reflector).canActivate(read.context)).toBe(true);
      const write = makeContext("estimator", undefined, undefined, undefined, { requirement, permissions: ["finance.view"], method: "POST" });
      expect(() => new RolesGuard(write.reflector).canActivate(write.context)).toThrow(ForbiddenException);
    });

    it("needs both the capability and the fixed roles when a route has both", () => {
      const noRole = makeContext("worker", ["owner", "admin", "accountant"], undefined, undefined, { requirement: "finance.manage", permissions: ["finance.manage"], method: "POST" });
      expect(() => new RolesGuard(noRole.reflector).canActivate(noRole.context)).toThrow(ForbiddenException);
      const noCapability = makeContext("accountant", ["owner", "admin", "accountant"], undefined, undefined, { requirement: "finance.manage", permissions: [], method: "POST" });
      expect(() => new RolesGuard(noCapability.reflector).canActivate(noCapability.context)).toThrow(ForbiddenException);
    });
  });
});
