import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ProjectAccessGuard } from "./project-access.guard";
import { ProjectAccessService } from "../project-access/project-access.service";

function makeContext(request: Record<string, unknown>, isPublic = false) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as unknown as Reflector;
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
  return { reflector, context };
}

describe("ProjectAccessGuard", () => {
  let projectAccess: { assertAccess: jest.Mock };

  beforeEach(() => {
    projectAccess = { assertAccess: jest.fn() };
  });

  it("allows a @Public() route without looking at projectId", async () => {
    const { reflector, context } = makeContext({ user: { userId: "u1", companyId: "c1", role: "worker" }, query: { projectId: "p1" } }, true);
    const guard = new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(projectAccess.assertAccess).not.toHaveBeenCalled();
  });

  it("allows an unauthenticated request through (JwtAuthGuard already rejects those)", async () => {
    const { reflector, context } = makeContext({ query: { projectId: "p1" } });
    const guard = new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(projectAccess.assertAccess).not.toHaveBeenCalled();
  });

  it("passes through when the request carries no projectId anywhere", async () => {
    const { reflector, context } = makeContext({ user: { userId: "u1", companyId: "c1", role: "worker" }, query: {}, params: {}, body: {} });
    const guard = new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(projectAccess.assertAccess).not.toHaveBeenCalled();
  });

  it("checks access using a route param projectId", async () => {
    const { reflector, context } = makeContext({ user: { userId: "u1", companyId: "c1", role: "worker" }, params: { projectId: "p1" }, query: {} });
    const guard = new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService);

    await guard.canActivate(context);
    expect(projectAccess.assertAccess).toHaveBeenCalledWith("c1", "p1", "u1", "worker");
  });

  it("checks access using a query string projectId", async () => {
    const { reflector, context } = makeContext({ user: { userId: "u1", companyId: "c1", role: "worker" }, query: { projectId: "p1" } });
    const guard = new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService);

    await guard.canActivate(context);
    expect(projectAccess.assertAccess).toHaveBeenCalledWith("c1", "p1", "u1", "worker");
  });

  it("checks access using a JSON body projectId (e.g. a create endpoint)", async () => {
    const { reflector, context } = makeContext({ user: { userId: "u1", companyId: "c1", role: "worker" }, query: {}, body: { projectId: "p1" } });
    const guard = new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService);

    await guard.canActivate(context);
    expect(projectAccess.assertAccess).toHaveBeenCalledWith("c1", "p1", "u1", "worker");
  });

  it("propagates a rejection from ProjectAccessService", async () => {
    projectAccess.assertAccess.mockRejectedValue(new ForbiddenException("nope"));
    const { reflector, context } = makeContext({ user: { userId: "u1", companyId: "c1", role: "worker" }, query: { projectId: "p1" } });
    const guard = new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
