import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TakeoffsService } from "./takeoffs.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";

const COMPANY_A = "company-a";

describe("TakeoffsService", () => {
  let service: TakeoffsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    takeoff: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    rateCatalogItem: { count: jest.Mock };
    takeoffMeasurement: { create: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
  };
  let storage: { save: jest.Mock; read: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      takeoff: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      rateCatalogItem: { count: jest.fn() },
      takeoffMeasurement: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    };
    storage = { save: jest.fn().mockResolvedValue({ storageKey: "key-1", size: 100 }), read: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [TakeoffsService, { provide: PrismaService, useValue: prisma }, { provide: StorageService, useValue: storage }],
    }).compile();

    service = module.get(TakeoffsService);
  });

  describe("create()", () => {
    it("rejects when the project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, "project-1", "Floor plan", { originalname: "plan.png", mimetype: "image/png", buffer: Buffer.from("x") } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.takeoff.create).not.toHaveBeenCalled();
    });
  });

  describe("addMeasurement()", () => {
    const CALIBRATED_TAKEOFF = { id: "takeoff-1", companyId: COMPANY_A, scalePixelLength: 100, scaleRealLength: 5, scaleUnit: "m" };

    it("rejects adding a measurement before the takeoff is calibrated", async () => {
      prisma.takeoff.findFirst.mockResolvedValue({ id: "takeoff-1", companyId: COMPANY_A, scalePixelLength: null, scaleRealLength: null, scaleUnit: null });

      await expect(
        service.addMeasurement(COMPANY_A, "takeoff-1", {
          type: "length",
          label: "Wall run",
          points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.takeoffMeasurement.create).not.toHaveBeenCalled();
    });

    it("rejects an area measurement with fewer than 3 points", async () => {
      prisma.takeoff.findFirst.mockResolvedValue(CALIBRATED_TAKEOFF);

      await expect(
        service.addMeasurement(COMPANY_A, "takeoff-1", {
          type: "area",
          label: "Room",
          points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("computes a length measurement's real-world value from calibration", async () => {
      prisma.takeoff.findFirst.mockResolvedValue(CALIBRATED_TAKEOFF);
      prisma.takeoffMeasurement.create.mockImplementation(({ data }) => Promise.resolve(data));

      // 100px calibrated to 5m; a 200px line should measure as 10m.
      const result = await service.addMeasurement(COMPANY_A, "takeoff-1", {
        type: "length",
        label: "Wall run",
        points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
      });

      expect(Number(result.value)).toBe(10);
      expect(result.unit).toBe("m");
    });

    it("rejects a rateCatalogItemId that does not belong to this company", async () => {
      prisma.takeoff.findFirst.mockResolvedValue(CALIBRATED_TAKEOFF);
      prisma.rateCatalogItem.count.mockResolvedValue(0);

      await expect(
        service.addMeasurement(COMPANY_A, "takeoff-1", {
          type: "length",
          label: "Wall run",
          points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
          rateCatalogItemId: "foreign-item",
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.takeoffMeasurement.create).not.toHaveBeenCalled();
    });
  });
});
