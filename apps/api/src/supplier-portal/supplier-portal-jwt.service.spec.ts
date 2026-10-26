import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { SupplierPortalJwtService } from "./supplier-portal-jwt.service";

describe("SupplierPortalJwtService", () => {
  let service: SupplierPortalJwtService;
  let config: { get: jest.Mock; getOrThrow: jest.Mock };

  beforeEach(async () => {
    config = { get: jest.fn().mockReturnValue("supplier-secret"), getOrThrow: jest.fn().mockReturnValue("fallback-secret") };

    const module = await Test.createTestingModule({
      providers: [SupplierPortalJwtService, JwtService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get(SupplierPortalJwtService);
  });

  it("round-trips a signed token back to its supplier/company ids", async () => {
    const token = service.sign({ supplierId: "supplier-1", companyId: "company-1", tokenVersion: 3 });
    const context = await service.verify(token);
    expect(context).toEqual({ supplierId: "supplier-1", companyId: "company-1", tokenVersion: 3 });
  });

  it("falls back to JWT_SECRET when SUPPLIER_PORTAL_JWT_SECRET is unset", async () => {
    config.get.mockReturnValue(undefined);
    const token = service.sign({ supplierId: "supplier-1", companyId: "company-1", tokenVersion: 3 });
    expect(config.getOrThrow).toHaveBeenCalledWith("JWT_SECRET");
    await expect(service.verify(token)).resolves.toEqual({ supplierId: "supplier-1", companyId: "company-1", tokenVersion: 3 });
  });

  it("rejects a token signed with a different secret", async () => {
    config.get.mockReturnValueOnce("secret-a");
    const token = service.sign({ supplierId: "supplier-1", companyId: "company-1", tokenVersion: 3 });
    config.get.mockReturnValue("secret-b");
    await expect(service.verify(token)).rejects.toThrow();
  });

  it("rejects a token whose kind isn't supplier-portal", async () => {
    const jwt = new JwtService();
    const foreignToken = jwt.sign({ sub: "someone", companyId: "company-1", kind: "client-portal" }, { secret: "supplier-secret" });
    await expect(service.verify(foreignToken)).rejects.toThrow("wrong token kind");
  });

  it("reads a token from before token versions existed as version 0", async () => {
    const legacy = new JwtService().sign({ sub: "supplier-1", companyId: "company-1", kind: "supplier-portal" }, { secret: "supplier-secret" });
    await expect(service.verify(legacy)).resolves.toEqual({ supplierId: "supplier-1", companyId: "company-1", tokenVersion: 0 });
  });

  it("issues tokens that expire after 7 days", async () => {
    const token = service.sign({ supplierId: "supplier-1", companyId: "company-1", tokenVersion: 0 });
    const { iat, exp } = new JwtService().decode<{ iat: number; exp: number }>(token);
    expect(exp - iat).toBe(7 * 24 * 60 * 60);
  });
});
