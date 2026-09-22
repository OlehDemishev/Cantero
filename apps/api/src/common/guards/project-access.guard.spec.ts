import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ProjectAccessGuard } from "./project-access.guard";
import { ProjectAccessService } from "../project-access/project-access.service";
import { PROJECT_RESOURCE_KEY, type ProjectResourceMeta } from "../project-access/project-resource.decorator";

function makeContext(request: Record<string, unknown>, isPublic = false, onHandler?: ProjectResourceMeta, onClass?: ProjectResourceMeta) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    getAll: jest.fn((key: string) => (key === PROJECT_RESOURCE_KEY ? [onHandler ? [onHandler] : undefined, onClass ? [onClass] : undefined] : [])),
  } as unknown as Reflector;
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
  return { reflector, context };
}

describe("ProjectAccessGuard", () => {
  let projectAccess: { assertAccess: jest.Mock; projectIdOf: jest.Mock };

  beforeEach(() => {
    projectAccess = { assertAccess: jest.fn(), projectIdOf: jest.fn().mockResolvedValue("p-owner") };
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

  it("reads :id as the project on a projects/:id route", async () => {
    const { reflector, context } = makeContext({ user: { userId: "u1", companyId: "c1", role: "worker" }, route: { path: "/api/projects/:id/permits" }, params: { id: "p1" }, query: {} });
    const guard = new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService);

    await guard.canActivate(context);
    expect(projectAccess.assertAccess).toHaveBeenCalledWith("c1", "p1", "u1", "worker");
  });

  it("propagates the denial on a projects/:id route", async () => {
    projectAccess.assertAccess.mockRejectedValue(new ForbiddenException());
    const { reflector, context } = makeContext({ user: { userId: "u1", companyId: "c1", role: "worker" }, route: { path: "/api/projects/:id" }, params: { id: "p1" } });
    const guard = new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it.each(["/api/tasks/:id", "/api/subprojects/:id/files", "/api/projects/:projectIdx"])("doesn't treat :id as a project on %s", async (path) => {
    const { reflector, context } = makeContext({ user: { userId: "u1", companyId: "c1", role: "worker" }, route: { path }, params: { id: "x1" }, query: {} });
    const guard = new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService);

    await guard.canActivate(context);
    expect(projectAccess.assertAccess).not.toHaveBeenCalled();
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
  describe("routes keyed by a child resource's own id (@ProjectResource)", () => {
    const worker = { userId: "u1", companyId: "c1", role: "worker" };

    it("looks the row up and checks the project it belongs to", async () => {
      const { reflector, context } = makeContext({ user: worker, params: { id: "t1" }, query: {} }, false, { model: "Task", param: "id" });
      await new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService).canActivate(context);
      expect(projectAccess.projectIdOf).toHaveBeenCalledWith("Task", "t1");
      expect(projectAccess.assertAccess).toHaveBeenCalledWith("c1", "p-owner", "u1", "worker");
    });

    it("reads the param the decorator names", async () => {
      const { reflector, context } = makeContext({ user: worker, params: { id: "t1", commitmentId: "k1" } }, false, { model: "TaskCommitment", param: "commitmentId" });
      await new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService).canActivate(context);
      expect(projectAccess.projectIdOf).toHaveBeenCalledWith("TaskCommitment", "k1");
    });

    it("propagates a denial for the row's project", async () => {
      projectAccess.assertAccess.mockRejectedValue(new ForbiddenException());
      const { reflector, context } = makeContext({ user: worker, params: { id: "t1" } }, false, { model: "Task", param: "id" });
      await expect(new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService).canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("leaves a missing or project-less row to the handler", async () => {
      projectAccess.projectIdOf.mockResolvedValue(null);
      const { reflector, context } = makeContext({ user: worker, params: { id: "gone" } }, false, { model: "Task", param: "id" });
      await expect(new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService).canActivate(context)).resolves.toBe(true);
      expect(projectAccess.assertAccess).not.toHaveBeenCalled();
    });

    it("doesn't look anything up for an owner or admin, who see every project", async () => {
      for (const role of ["owner", "admin"]) {
        const { reflector, context } = makeContext({ user: { ...worker, role }, params: { id: "t1" } }, false, { model: "Task", param: "id" });
        await new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService).canActivate(context);
      }
      expect(projectAccess.projectIdOf).not.toHaveBeenCalled();
      expect(projectAccess.assertAccess).not.toHaveBeenCalled();
    });

    it("checks both the controller's and the handler's resource, each project once", async () => {
      projectAccess.projectIdOf.mockImplementation(async (model: string) => (model === "Estimate" ? "p-est" : "p-co"));
      const { reflector, context } = makeContext(
        { user: worker, params: { estimateId: "e1", id: "co1" } },
        false,
        { model: "ChangeOrder", param: "id" },
        { model: "Estimate", param: "estimateId" },
      );
      await new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService).canActivate(context);
      expect(projectAccess.projectIdOf.mock.calls).toEqual([
        ["ChangeOrder", "co1"],
        ["Estimate", "e1"],
      ]);
      expect(projectAccess.assertAccess.mock.calls.map((c) => c[1])).toEqual(["p-co", "p-est"]);
    });

    it("skips a controller-level resource whose param this route doesn't have", async () => {
      const { reflector, context } = makeContext({ user: worker, params: {} }, false, undefined, { model: "Estimate", param: "estimateId" });
      await new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService).canActivate(context);
      expect(projectAccess.projectIdOf).not.toHaveBeenCalled();
    });

    it("does nothing for a route marked @NotProjectScoped", async () => {
      const { reflector, context } = makeContext({ user: worker, params: { id: "w1" } }, false, { exempt: "workers are company-level" });
      await new ProjectAccessGuard(reflector, projectAccess as unknown as ProjectAccessService).canActivate(context);
      expect(projectAccess.projectIdOf).not.toHaveBeenCalled();
    });
  });
});
