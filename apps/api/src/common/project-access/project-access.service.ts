import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { excludeProjectsWhere, projectPathFor, projectSelect, readProjectId } from "./project-path";

/**
 * Single source of truth for "can this member see/touch this project" — a project with
 * `restrictedToMembers` set is visible to its owner/admin always, and to everyone else only if
 * they're on its ProjectMember list. An internal/service-to-service caller (no userId/role, same
 * convention as ProjectsService) is trusted and skips the check entirely.
 *
 * Every project-scoped controller across the app is expected to go through either
 * ProjectAccessGuard (for the common case: a request carrying `projectId` directly in its route
 * param, query string, or JSON body) or this service directly (for an endpoint that looks up a
 * child resource by its own id and only learns that resource's projectId after the fetch).
 */
/** Who is asking — an AuthUser fits. No userId/role means an internal caller, which sees everything. */
export interface ProjectViewer {
  userId?: string;
  role?: string;
}

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(companyId: string, projectId: string, userId?: string, role?: string): Promise<void> {
    if (!userId || !role || ProjectAccessService.seesEveryProject(userId, role)) return;

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      select: { restrictedToMembers: true },
    });
    // Not found (wrong company, or doesn't exist) — leave the 404 to whatever the caller does
    // with the id next; this check only ever narrows access, never reveals existence.
    if (!project || !project.restrictedToMembers) return;

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership) throw new ForbiddenException("You don't have access to this project");
  }

  /** Whether this caller skips the restricted-project check entirely (see the class comment). */
  static seesEveryProject(userId?: string, role?: string): boolean {
    return !userId || !role || role === "owner" || role === "admin";
  }

  /**
   * The project a `model` row belongs to, following its parents when it has no projectId of its
   * own (projectPathFor). Null when there's no such row or it isn't tied to a project. Not scoped
   * to a company: the id is only used to find the project, and assertAccess then only looks the
   * project up within the caller's company.
   */
  async projectIdOf(model: Prisma.ModelName, id: string): Promise<string | null> {
    const path = projectPathFor(model);
    if (!path) throw new Error(`${model} has no path to a project`);
    const delegate = (this.prisma as unknown as Record<string, { findUnique(args: unknown): Promise<unknown> }>)[model[0].toLowerCase() + model.slice(1)];
    const row = await delegate.findUnique({ where: { id }, select: projectSelect(path) }).catch(() => null);
    return readProjectId(row, path);
  }

  /**
   * Restricted projects in `companyId` this caller isn't a member of — what every company-wide
   * list, summary and export has to leave out. Empty for an owner/admin or when the company has
   * no restricted projects, which is the common case and costs one small query.
   */
  async hiddenProjectIds(companyId: string, userId?: string, role?: string): Promise<string[]> {
    if (!userId || !role || ProjectAccessService.seesEveryProject(userId, role)) return [];
    const hidden = await this.prisma.project.findMany({
      where: { companyId, restrictedToMembers: true, members: { none: { userId } } },
      select: { id: true },
    });
    return hidden.map((p) => p.id);
  }

  /**
   * A `where` fragment for `model` that drops rows belonging to a project the caller can't see,
   * following the row to its project the same way @ProjectResource does. Rows not tied to any
   * project stay. `{}` when nothing is hidden, so it can always be added:
   * `where: { AND: [where, await this.projectAccess.visibleWhere(companyId, "DailyLog", userId, role)] }`.
   */
  async visibleWhere(companyId: string, model: Prisma.ModelName, userId?: string, role?: string): Promise<Record<string, unknown>> {
    const hidden = await this.hiddenProjectIds(companyId, userId, role);
    return hidden.length === 0 ? {} : excludeProjectsWhere(model, hidden);
  }

  /** Narrows a list of already-company-scoped project rows down to the ones `userId`/`role` may
   * see. Used by ProjectsService.list() and by any cross-project view (e.g. a portfolio schedule)
   * that starts from a set of project ids rather than one. */
  async filterAccessible<T extends { id: string; restrictedToMembers: boolean }>(
    projects: T[],
    userId?: string,
    role?: string,
  ): Promise<T[]> {
    if (!userId || !role || role === "owner" || role === "admin") return projects;

    const restrictedIds = projects.filter((p) => p.restrictedToMembers).map((p) => p.id);
    if (restrictedIds.length === 0) return projects;

    const memberships = await this.prisma.projectMember.findMany({
      where: { userId, projectId: { in: restrictedIds } },
      select: { projectId: true },
    });
    const memberProjectIds = new Set(memberships.map((m) => m.projectId));
    return projects.filter((p) => !p.restrictedToMembers || memberProjectIds.has(p.id));
  }
}
