import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const TOUCH_INTERVAL_MS = 60 * 1000;

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

  /** Whether a request may still use this session: not revoked and, when the company sets
   * Company.sessionTimeoutMinutes, not idle for longer than that — a company-wide policy, opt-in
   * (null disables it), enforced here rather than by shortening the JWT's own expiry so it can be
   * changed without forcing every existing session to re-login. A request that passes counts as
   * activity, but lastSeenAt is only written once it's a minute old: a write on every request
   * would cost more than a minute's precision is worth, for the inactivity timeout and the
   * "active sessions" list alike. */
  async stillActive(sessionId: string, companyId: string): Promise<boolean> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true, lastSeenAt: true },
    });
    if (!session || session.revokedAt !== null) return false;

    const idleMs = Date.now() - session.lastSeenAt.getTime();
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { sessionTimeoutMinutes: true } });
    if (company?.sessionTimeoutMinutes && idleMs > company.sessionTimeoutMinutes * 60 * 1000) return false;

    if (idleMs >= TOUCH_INTERVAL_MS) this.touch(sessionId);
    return true;
  }

  /** Best-effort — never awaited, so a slow write never adds latency to a request. */
  private touch(sessionId: string): void {
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
