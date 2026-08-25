import { JwtService } from "@nestjs/jwt";
import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";
import { PrismaService } from "../common/prisma/prisma.service";

describe("AuthService.login", () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };
  let jwt: JwtService;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    jwt = new JwtService({ secret: "test-secret" });
    service = new AuthService(prisma as never, jwt);
  });

  it("throws on an unknown email", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login({ email: "nobody@example.com", password: "x" })).rejects.toThrow(UnauthorizedException);
  });

  it("issues a token with only the base role when no custom role is assigned", async () => {
    const passwordHash = await bcrypt.hash("correct-horse", 12);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "jane@example.com",
      name: "Jane",
      passwordHash,
      memberships: [{ companyId: "company-a", role: "worker", customRole: null }],
    });

    const { accessToken } = await service.login({ email: "jane@example.com", password: "correct-horse" });
    const decoded = jwt.verify(accessToken) as { role: string; additionalRoles?: string[] };

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
      memberships: [
        { companyId: "company-a", role: "worker", customRole: { name: "Site Lead", basePermissions: ["foreman", "estimator"] } },
      ],
    });

    const { accessToken } = await service.login({ email: "jane@example.com", password: "correct-horse" });
    const decoded = jwt.verify(accessToken) as { role: string; additionalRoles?: string[] };

    expect(decoded.role).toBe("worker");
    expect(decoded.additionalRoles).toEqual(["foreman", "estimator"]);
  });
});
