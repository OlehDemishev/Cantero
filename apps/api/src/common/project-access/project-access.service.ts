import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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
@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(companyId: string, projectId: string, userId?: string, role?: string): Promise<void> {
    if (!userId || !role || role === "owner" || role === "admin") return;

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
