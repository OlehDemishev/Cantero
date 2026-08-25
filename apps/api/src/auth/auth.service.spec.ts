import { JwtService } from "@nestjs/jwt";
import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { SessionsService } from "../common/sessions/sessions.service";

const NO_META = {};

describe("AuthService.login", () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };
  let jwt: JwtService;
  let sessions: { create: jest.Mock };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    jwt = new JwtService({ secret: "test-secret" });
    sessions = { create: jest.fn().mockResolvedValue("session-1") };
    service = new AuthService(prisma as never, jwt, sessions as unknown as SessionsService);
  });

  it("throws on an unknown email", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login({ email: "nobody@example.com", password: "x" }, NO_META)).rejects.toThrow(UnauthorizedException);
  });

  it("issues a token with only the base role when no custom role is assigned", async () => {
    const passwordHash = await bcrypt.hash("correct-horse", 12);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "jane@example.com",
      name: "Jane",
      passwordHash,
      totpEnabledAt: null,
      memberships: [{ companyId: "company-a", role: "worker", customRole: null }],
    });

    const result = await service.login({ email: "jane@example.com", password: "correct-horse" }, NO_META);
    if ("requires2fa" in result) throw new Error("expected a direct login result");
    const decoded = jwt.verify(result.accessToken) as { role: string; additionalRoles?: string[] };

    expect(decoded.role).toBe("worker");
    expect(decoded.additionalRoles).toBeUndefined();
  });

  it("includes the custom role's basePermissions as additionalRoles in the issued token", async () => {
    const passwordHash = await bcrypt.hash("correct-horse", 12);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "jane@example.com",
      name: "Jane",
      passwordHash,
      totpEnabledAt: null,
      memberships: [
        { companyId: "company-a", role: "worker", customRole: { name: "Site Lead", basePermissions: ["foreman", "estimator"] } },
      ],
    });

    const result = await service.login({ email: "jane@example.com", password: "correct-horse" }, NO_META);
    if ("requires2fa" in result) throw new Error("expected a direct login result");
    const decoded = jwt.verify(result.accessToken) as { role: string; additionalRoles?: string[] };

    expect(decoded.role).toBe("worker");
    expect(decoded.additionalRoles).toEqual(["foreman", "estimator"]);
  });

  it("returns a 2FA challenge instead of a token when the account has 2FA enabled", async () => {
    const passwordHash = await bcrypt.hash("correct-horse", 12);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "jane@example.com",
      name: "Jane",
      passwordHash,
      totpEnabledAt: new Date(),
      memberships: [{ companyId: "company-a", role: "worker", customRole: null }],
    });

    const result = await service.login({ email: "jane@example.com", password: "correct-horse" }, NO_META);

    expect("requires2fa" in result && result.requires2fa).toBe(true);
    expect(sessions.create).not.toHaveBeenCalled();
  });
});
