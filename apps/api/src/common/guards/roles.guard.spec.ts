import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

function makeContext(role: string | undefined, requiredRoles: string[] | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredRoles) } as unknown as Reflector;
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
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
});
