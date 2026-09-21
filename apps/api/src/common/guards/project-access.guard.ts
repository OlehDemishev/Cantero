import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthUser } from "@cantero/shared";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
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
 * It does NOT cover a request that only carries the *child resource's own* id (e.g.
 * `PATCH /tasks/:id`, `GET /documents/:id/download`) — there, the project is only known after the
 * service looks the resource up, so that service must call ProjectAccessService itself once it
 * has the row's projectId.
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

    const projectId =
      firstString(request.params?.projectId) ??
      projectIdFromProjectsRoute(request) ??
      firstString(request.query?.projectId) ??
      firstString(request.body?.projectId);
    if (!projectId) return true;

    await this.projectAccess.assertAccess(user.companyId, projectId, user.userId, user.role);
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
