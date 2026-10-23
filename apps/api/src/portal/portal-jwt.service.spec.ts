import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PortalJwtService } from "./portal-jwt.service";

describe("PortalJwtService", () => {
  let service: PortalJwtService;
  let config: { get: jest.Mock; getOrThrow: jest.Mock };

  beforeEach(async () => {
    config = { get: jest.fn().mockReturnValue("portal-secret"), getOrThrow: jest.fn().mockReturnValue("fallback-secret") };

    const module = await Test.createTestingModule({
      providers: [PortalJwtService, JwtService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get(PortalJwtService);
  });

  it("round-trips a signed token back to its client/company ids", async () => {
    const token = service.sign({ clientId: "client-1", companyId: "company-1", tokenVersion: 3 });
    const context = await service.verify(token);
    expect(context).toEqual({ clientId: "client-1", companyId: "company-1", tokenVersion: 3 });
  });

  it("falls back to JWT_SECRET when PORTAL_JWT_SECRET is unset", async () => {
    config.get.mockReturnValue(undefined);
    const token = service.sign({ clientId: "client-1", companyId: "company-1", tokenVersion: 3 });
    expect(config.getOrThrow).toHaveBeenCalledWith("JWT_SECRET");
    await expect(service.verify(token)).resolves.toEqual({ clientId: "client-1", companyId: "company-1", tokenVersion: 3 });
  });

  it("rejects a token signed with a different secret", async () => {
    config.get.mockReturnValueOnce("secret-a");
    const token = service.sign({ clientId: "client-1", companyId: "company-1", tokenVersion: 3 });
    config.get.mockReturnValue("secret-b");
    await expect(service.verify(token)).rejects.toThrow();
  });

  it("rejects a token whose kind isn't client-portal", async () => {
    const jwt = new JwtService();
    const foreignToken = jwt.sign({ sub: "someone", companyId: "company-1", kind: "supplier-portal" }, { secret: "portal-secret" });
    await expect(service.verify(foreignToken)).rejects.toThrow("wrong token kind");
  });

  it("reads a token from before token versions existed as version 0", async () => {
    const legacy = new JwtService().sign({ sub: "client-1", companyId: "company-1", kind: "client-portal" }, { secret: "portal-secret" });
    await expect(service.verify(legacy)).resolves.toEqual({ clientId: "client-1", companyId: "company-1", tokenVersion: 0 });
  });

  it("issues tokens that expire after 7 days", async () => {
    const token = service.sign({ clientId: "client-1", companyId: "company-1", tokenVersion: 0 });
    const { iat, exp } = new JwtService().decode<{ iat: number; exp: number }>(token);
    expect(exp - iat).toBe(7 * 24 * 60 * 60);
  });
});
