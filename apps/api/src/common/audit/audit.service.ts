import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditActor {
  userId?: string;
  name: string;
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

  list(companyId: string, take: number, cursor?: string) {
    return this.prisma.auditLog.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }
}
