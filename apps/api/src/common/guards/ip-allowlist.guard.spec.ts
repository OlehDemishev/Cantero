import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { IpAllowlistGuard } from "./ip-allowlist.guard";
import { PrismaService } from "../prisma/prisma.service";

function contextWith(ip: string, user: { companyId: string } | undefined) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ ip, user }) }),
  } as unknown as ExecutionContext;
}

describe("IpAllowlistGuard", () => {
  let guard: IpAllowlistGuard;
  let prisma: { company: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { company: { findUnique: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [
        IpAllowlistGuard,
        { provide: PrismaService, useValue: prisma },
        Reflector,
      ],
    }).compile();

    guard = module.get(IpAllowlistGuard);
  });

  it("allows unauthenticated requests through (JwtAuthGuard already rejected them if needed)", async () => {
    await expect(guard.canActivate(contextWith("1.2.3.4", undefined))).resolves.toBe(true);
  });

  it("allows any IP when the company has no allowlist configured", async () => {
    prisma.company.findUnique.mockResolvedValue({ ipAllowlist: [] });
    await expect(guard.canActivate(contextWith("203.0.113.99", { companyId: "company-a" }))).resolves.toBe(true);
  });

  it("allows an exact-IP match", async () => {
    prisma.company.findUnique.mockResolvedValue({ ipAllowlist: ["203.0.113.4"] });
    await expect(guard.canActivate(contextWith("203.0.113.4", { companyId: "company-a" }))).resolves.toBe(true);
  });

  it("rejects an IP not on the allowlist", async () => {
    prisma.company.findUnique.mockResolvedValue({ ipAllowlist: ["203.0.113.4"] });
    await expect(guard.canActivate(contextWith("198.51.100.1", { companyId: "company-a" }))).rejects.toThrow(ForbiddenException);
  });

  it("allows an IP inside an allowed CIDR block", async () => {
    prisma.company.findUnique.mockResolvedValue({ ipAllowlist: ["203.0.113.0/24"] });
    await expect(guard.canActivate(contextWith("203.0.113.200", { companyId: "company-a" }))).resolves.toBe(true);
  });

  it("rejects an IP outside an allowed CIDR block", async () => {
    prisma.company.findUnique.mockResolvedValue({ ipAllowlist: ["203.0.113.0/24"] });
    await expect(guard.canActivate(contextWith("203.0.114.1", { companyId: "company-a" }))).rejects.toThrow(ForbiddenException);
  });

  it("strips the IPv4-mapped IPv6 prefix before matching", async () => {
    prisma.company.findUnique.mockResolvedValue({ ipAllowlist: ["203.0.113.4"] });
    await expect(guard.canActivate(contextWith("::ffff:203.0.113.4", { companyId: "company-a" }))).resolves.toBe(true);
  });
});
