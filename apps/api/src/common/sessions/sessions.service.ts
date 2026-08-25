import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * A thin revocation layer on top of otherwise-stateless JWTs. Each issued access token carries a
 * `sid` claim pointing at one of these rows; JwtAuthGuard rejects a token whose session has been
 * revoked. This is the only DB-backed piece of the auth scheme — everything else about a request
 * (roles, company, etc.) still comes straight from the token payload.
 */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, meta: SessionMeta): Promise<string> {
    const session = await this.prisma.userSession.create({
      data: { userId, userAgent: meta.userAgent, ipAddress: meta.ipAddress },
    });
    return session.id;
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId }, select: { revokedAt: true } });
    return !session || session.revokedAt !== null;
  }

  /** Best-effort — never awaited by the caller, so a slow write never adds latency to a request. */
  touch(sessionId: string): void {
    this.prisma.userSession.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }

  list(userId: string) {
    return this.prisma.userSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  async revoke(userId: string, sessionId: string): Promise<{ ok: true }> {
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Session not found");
    if (session.userId !== userId) throw new ForbiddenException("Not your session");
    await this.prisma.userSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    return { ok: true };
  }
}
