import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { toCsv } from "../csv";

export interface AuditActor {
  userId?: string;
  name: string;
}

export interface AuditLogFilter {
  dateFrom?: Date;
  dateTo?: Date;
  entityType?: string;
  action?: string;
  actorUserId?: string;
}

/**
 * Best-effort, fire-and-forget logging: an audit write failing must never
 * break the business action it's describing, so errors are swallowed here
 * rather than propagated.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    companyId: string,
    actor: AuditActor,
    action: string,
    entityType: string,
    entityId: string,
    summary: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.prisma.auditLog
      .create({
        data: {
          companyId,
          actorUserId: actor.userId,
          actorName: actor.name,
          action,
          entityType,
          entityId,
          summary,
          metadata: metadata as never,
        },
      })
      .catch(() => {});
  }

  list(companyId: string, take: number, cursor?: string, filter?: AuditLogFilter) {
    return this.prisma.auditLog.findMany({
      where: this.whereFor(companyId, filter),
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }

  /** Same filters as list(), unpaginated — a compliance/audit export is expected to be read
   * outside the app (spreadsheet, records request), not paged through here. */
  async exportCsv(companyId: string, filter?: AuditLogFilter): Promise<string> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.whereFor(companyId, filter),
      orderBy: { createdAt: "desc" },
    });
    return toCsv(
      ["Date", "Actor", "Action", "Entity type", "Entity ID", "Summary"],
      rows.map((r) => [r.createdAt.toISOString(), r.actorName, r.action, r.entityType, r.entityId, r.summary]),
    );
  }

  private whereFor(companyId: string, filter?: AuditLogFilter) {
    return {
      companyId,
      ...(filter?.dateFrom || filter?.dateTo
        ? { createdAt: { ...(filter.dateFrom ? { gte: filter.dateFrom } : {}), ...(filter.dateTo ? { lte: filter.dateTo } : {}) } }
        : {}),
      ...(filter?.entityType ? { entityType: filter.entityType } : {}),
      ...(filter?.action ? { action: filter.action } : {}),
      ...(filter?.actorUserId ? { actorUserId: filter.actorUserId } : {}),
    };
  }
}
