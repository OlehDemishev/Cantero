import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CREW_PERMISSIONS, type AuthUser, type Permission } from "@cantero/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * "Only your own" for a member without the capability to see the crew's records — a worker logs and
 * sees their own hours, expenses, time off, training and tools, not their colleagues'. Their own
 * means the worker records linked to their user account (Worker.userId).
 */
/** The capability (or any of several) that lets a member see and act on colleagues' records. */
export type Crew = Permission | readonly Permission[];

/** Who sees whose records, per kind — shared with the apps so they offer the same choice. */
export const CREW = CREW_PERMISSIONS;

@Injectable()
export class SelfScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Whether `user` sees everyone's records: holding any one of `crew` does it. An internal caller
   * (no permissions attached) is trusted. */
  seesCrew(user: AuthUser, crew: Crew = "site.crewTime"): boolean {
    return !user.permissions || [crew].flat().some((p) => user.permissions!.includes(p));
  }

  /** The worker records that are this user's own, in their company. */
  async ownWorkerIds(user: AuthUser): Promise<string[]> {
    const rows = await this.prisma.worker.findMany({ where: { companyId: user.companyId, userId: user.userId }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  /**
   * The workerIds a list may show: undefined for someone who sees the crew, otherwise only their
   * own — narrowed further to `requested` if they asked for one worker.
   */
  async listScope(user: AuthUser, requested?: string, crew: Crew = "site.crewTime"): Promise<string[] | undefined> {
    if (this.seesCrew(user, crew)) return undefined;
    const own = await this.ownWorkerIds(user);
    return requested ? own.filter((id) => id === requested) : own;
  }

  /** Refuses acting for or reading another worker without the crew capability. */
  async assertOwnWorker(user: AuthUser, workerId: string, crew: Crew = "site.crewTime"): Promise<void> {
    if (this.seesCrew(user, crew)) return;
    if (!(await this.ownWorkerIds(user)).includes(workerId)) throw new ForbiddenException("You can only do this for yourself");
  }

  /** Same, for an existing record identified by id: looks up whose it is first. */
  async assertOwnRecord(
    user: AuthUser,
    model: "timeEntry" | "expense" | "timeOffRequest" | "toolCheckout" | "trainingEnrollment",
    id: string,
    crew: Crew = "site.crewTime",
  ): Promise<void> {
    if (this.seesCrew(user, crew)) return;
    const delegate = (this.prisma as unknown as Record<string, { findFirst(args: unknown): Promise<{ workerId: string | null } | null> }>)[model];
    const row = await delegate.findFirst({ where: { id, companyId: user.companyId }, select: { workerId: true } });
    if (!row) throw new NotFoundException("Not found");
    if (!row.workerId || !(await this.ownWorkerIds(user)).includes(row.workerId)) throw new ForbiddenException("You can only do this for yourself");
  }
}
