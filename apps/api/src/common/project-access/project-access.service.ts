import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import type { MembershipRole, Prisma } from "@prisma/client";
import { PermissionsService } from "../permissions/permissions.service";
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
  constructor(
    private readonly prisma: PrismaService,
    // Optional so a unit test that builds this service alone keeps the old behaviour: every
    // project visible apart from restricted ones.
    @Optional() private readonly permissions?: PermissionsService,
  ) {}

  /**
   * Null when the member sees every project of the company (the "projects.all" capability, which
   * every role has by default); otherwise the projects that are theirs — ones they're a member of,
   * or where one of their worker records is assigned in resource planning.
   */
  async ownProjectScope(companyId: string, userId: string, role: string): Promise<Set<string> | null> {
    if (!this.permissions || ProjectAccessService.seesEveryProject(userId, role)) return null;
    let granted = await this.permissions.effectiveFor(companyId, role as MembershipRole);
    if (!granted.includes("projects.all")) {
      // A custom role can add it back.
      const membership = await this.prisma.membership.findUnique({ where: { userId_companyId: { userId, companyId } }, include: { customRole: true } });
      granted = await this.permissions.effectiveFor(companyId, role as MembershipRole, membership?.customRole);
    }
    if (granted.includes("projects.all")) return null;
    const [members, assignments] = await Promise.all([
      this.prisma.projectMember.findMany({ where: { companyId, userId }, select: { projectId: true } }),
      this.prisma.resourceAssignment.findMany({ where: { companyId, worker: { userId } }, select: { projectId: true } }),
    ]);
    return new Set([...members, ...assignments].map((r) => r.projectId));
  }

  async assertAccess(companyId: string, projectId: string, userId?: string, role?: string): Promise<void> {
    if (!userId || !role || ProjectAccessService.seesEveryProject(userId, role)) return;
    const own = await this.ownProjectScope(companyId, userId, role);
    if (own && !own.has(projectId)) {
      const exists = await this.prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
      // Same as below: a project of another company is left to the caller's own 404.
      if (exists) throw new ForbiddenException("You don't have access to this project");
      return;
    }

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
    const own = await this.ownProjectScope(companyId, userId, role);
    const hidden = await this.prisma.project.findMany({
      where: own
        ? { companyId, id: { notIn: [...own] } }
        : { companyId, restrictedToMembers: true, members: { none: { userId } } },
      select: { id: true },
    });
    if (!own) return hidden.map((p) => p.id);
    // Their own projects can still be restricted ones they were assigned to without being a member.
    const restrictedOwn = await this.prisma.project.findMany({
      where: { companyId, id: { in: [...own] }, restrictedToMembers: true, members: { none: { userId } } },
      select: { id: true },
    });
    return [...hidden, ...restrictedOwn].map((p) => p.id);
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
    if (projects.length > 0 && this.permissions) {
      const company = await this.prisma.project.findFirst({ where: { id: projects[0].id }, select: { companyId: true } });
      const own = company ? await this.ownProjectScope(company.companyId, userId, role) : null;
      if (own) projects = projects.filter((p) => own.has(p.id));
    }

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
