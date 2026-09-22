import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthUser } from "@cantero/shared";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { PROJECT_RESOURCE_KEY, type ProjectResourceMeta } from "../project-access/project-resource.decorator";
import { ProjectAccessService } from "../project-access/project-access.service";

/**
 * Enforces Project.restrictedToMembers on every request that carries a `projectId` directly — as
 * a route param, a query string param, or a field in the JSON body — regardless of which
 * controller it is. This is what closes the gap a per-service check can't: a restricted project's
 * documents, tasks, RFIs, etc. all get filtered by this one guard without each of those services
 * needing to remember to ask.
 *
 * A route shaped `projects/:id/…` (ProjectsController, and ~50 older nested routes) names the
 * project `:id` rather than `:projectId`; that `:id` is read as the project too, so those routes
 * can't silently skip the check. project-routes.spec.ts fails on any other spelling.
 *
 * A request that only carries a *child resource's own* id (e.g. `PATCH /tasks/:id`,
 * `GET /documents/:id/download`) is covered through @ProjectResource on the route or controller:
 * the guard looks that row up, follows it to its project and applies the same check.
 * project-resource-routes.spec.ts fails on an id-keyed route that declares neither
 * @ProjectResource nor @NotProjectScoped.
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user) return true; // JwtAuthGuard already rejects an unauthenticated request

    if (ProjectAccessService.seesEveryProject(user.userId, user.role)) return true;

    const projectId =
      firstString(request.params?.projectId) ??
      projectIdFromProjectsRoute(request) ??
      firstString(request.query?.projectId) ??
      firstString(request.body?.projectId);
    if (projectId) await this.projectAccess.assertAccess(user.companyId, projectId, user.userId, user.role);

    const checked = new Set(projectId ? [projectId] : []);
    const resources = this.reflector.getAll<(ProjectResourceMeta[] | undefined)[]>(PROJECT_RESOURCE_KEY, [context.getHandler(), context.getClass()]).flat();
    for (const resource of resources) {
      if (!resource || !("model" in resource)) continue;
      const id = firstString(request.params?.[resource.param]);
      if (!id) continue;
      // Not found, or not tied to a project: nothing to restrict here; the handler answers 404 itself.
      const owner = await this.projectAccess.projectIdOf(resource.model, id);
      if (!owner || checked.has(owner)) continue;
      checked.add(owner);
      await this.projectAccess.assertAccess(user.companyId, owner, user.userId, user.role);
    }
    return true;
  }
}

/** Express's matched route pattern, e.g. "/api/projects/:id/permits" — only a literal
 * `projects/:id` segment counts, never an `:id` that belongs to some other resource. */
const PROJECTS_ID_ROUTE = /(^|\/)projects\/:id(\/|$)/;
function projectIdFromProjectsRoute(request: { route?: { path?: unknown }; params?: Record<string, unknown> }): string | undefined {
  const path = request.route?.path;
  if (typeof path !== "string" || !PROJECTS_ID_ROUTE.test(path)) return undefined;
  return firstString(request.params?.id);
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}
