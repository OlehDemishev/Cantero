import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

function makeContext(role: string | undefined, requiredRoles: string[] | undefined, additionalRoles?: string[]) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredRoles) } as unknown as Reflector;
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role, additionalRoles } : undefined }) }),
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
});
