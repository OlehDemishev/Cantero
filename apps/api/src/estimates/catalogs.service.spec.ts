import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CatalogsService } from "./catalogs.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("CatalogsService", () => {
  let service: CatalogsService;
  let prisma: { catalog: { findFirst: jest.Mock; create: jest.Mock; delete: jest.Mock } };

  beforeEach(async () => {
    prisma = { catalog: { findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() } };
    const module = await Test.createTestingModule({
      providers: [CatalogsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CatalogsService);
  });

  describe("create()", () => {
    it("rejects a duplicate catalog name within the same company", async () => {
      prisma.catalog.findFirst.mockResolvedValue({ id: "existing" });

      await expect(service.create(COMPANY_A, { name: "Residential" })).rejects.toThrow(BadRequestException);
      expect(prisma.catalog.create).not.toHaveBeenCalled();
    });

    it("creates the catalog when the name is unique", async () => {
      prisma.catalog.findFirst.mockResolvedValue(null);
      prisma.catalog.create.mockResolvedValue({ id: "new-catalog", name: "Commercial" });

      const result = await service.create(COMPANY_A, { name: "Commercial" });

      expect(result).toEqual({ id: "new-catalog", name: "Commercial" });
    });
  });

  describe("delete()", () => {
    it("rejects a catalog that does not belong to this company", async () => {
      prisma.catalog.findFirst.mockResolvedValue(null);

      await expect(service.delete(COMPANY_A, "catalog-1")).rejects.toThrow(NotFoundException);
      expect(prisma.catalog.delete).not.toHaveBeenCalled();
    });
  });
});
