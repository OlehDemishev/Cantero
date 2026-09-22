import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TakeoffsService } from "./takeoffs.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";

const COMPANY_A = "company-a";

// pdf.js can't load under Jest (see drawings/sheet-recognition.spec.ts, which runs it for real).
const mockPdfPageCount = jest.fn();
jest.mock("../drawings/pdf-text", () => ({ pdfPageCount: (...args: unknown[]) => mockPdfPageCount(...args) }));

describe("TakeoffsService", () => {
  let service: TakeoffsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    takeoff: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    drawingSheet: { findFirst: jest.Mock };
    rateCatalogItem: { count: jest.Mock };
    takeoffMeasurement: { create: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
  };
  let storage: { save: jest.Mock; read: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      takeoff: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      drawingSheet: { findFirst: jest.fn() },
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

  describe("PDF drawings, counts and printed scales", () => {
    const pdf = (page?: number) => ({ originalname: "set.pdf", mimetype: "application/pdf", buffer: Buffer.from("%PDF"), page });

    it("rejects a file that isn't a drawing", async () => {
      await expect(service.create(COMPANY_A, "project-1", "x", { originalname: "a.docx", mimetype: "application/msword", buffer: Buffer.from("x") } as any)).rejects.toThrow(BadRequestException);
    });

    it("measures the chosen page of a PDF and refuses a page that isn't there", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      mockPdfPageCount.mockResolvedValue(3);
      await service.create(COMPANY_A, "project-1", "Level 2", pdf() as any, 2);
      expect(prisma.takeoff.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ imageMimeType: "application/pdf", pageNumber: 2 }) }));
      await expect(service.create(COMPANY_A, "project-1", "Level 9", pdf() as any, 9)).rejects.toThrow("This PDF has 3 pages");
    });

    it("starts a takeoff on a Plan room sheet's own file, named after the sheet", async () => {
      prisma.drawingSheet.findFirst.mockResolvedValue({ id: "sheet-1", sheetNumber: "A-101", title: "Ground floor", storageKey: "sheets/a101.pdf", mimeType: "application/pdf" });
      await service.createFromSheet(COMPANY_A, "project-1", "sheet-1");
      expect(prisma.drawingSheet.findFirst).toHaveBeenCalledWith({ where: { id: "sheet-1", companyId: COMPANY_A, projectId: "project-1" } });
      expect(prisma.takeoff.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: "A-101 Ground floor", imageStorageKey: "sheets/a101.pdf", imageMimeType: "application/pdf", sourceSheetId: "sheet-1" }),
      });
      expect(storage.save).not.toHaveBeenCalled();
    });

    it("refuses a sheet from another project", async () => {
      prisma.drawingSheet.findFirst.mockResolvedValue(null);
      await expect(service.createFromSheet(COMPANY_A, "project-1", "sheet-x")).rejects.toThrow(NotFoundException);
    });

    it.each([
      [100, "m", 2.54], // 1:100 → 1 inch of paper is 2.54 m
      [50, "mm", 1270],
      [48, "ft", 4], // 1/4" = 1'-0"
    ] as const)("sets 1:%s in %s from the printed ratio", async (ratio, unit, perInch) => {
      prisma.takeoff.findFirst.mockResolvedValue({ id: "t1", imageMimeType: "application/pdf" });
      await service.calibrateByRatio(COMPANY_A, "t1", { ratio, unit });
      const { data } = prisma.takeoff.update.mock.calls[0][0];
      expect(data.scalePixelLength).toBe(72);
      expect(data.scaleRealLength).toBeCloseTo(perInch, 9);
      expect(data.scaleUnit).toBe(unit);
    });

    it("measures a PDF line exactly at a printed scale: 72 PDF units at 1:100 is 2.54 m", async () => {
      prisma.takeoff.findFirst.mockResolvedValue({ id: "t1", imageMimeType: "application/pdf" });
      await service.calibrateByRatio(COMPANY_A, "t1", { ratio: 100, unit: "m" });
      prisma.takeoff.findFirst.mockResolvedValue({ id: "t1", ...prisma.takeoff.update.mock.calls[0][0].data });
      prisma.takeoffMeasurement.create.mockImplementation(async (args: unknown) => args);
      const created = (await service.addMeasurement(COMPANY_A, "t1", { type: "length", label: "Wall", points: [{ x: 0, y: 0 }, { x: 72, y: 0 }] })) as any;
      expect(created.data.value).toBeCloseTo(2.54, 9);
    });

    it("refuses a ratio on an image, which has no physical size", async () => {
      prisma.takeoff.findFirst.mockResolvedValue({ id: "t1", imageMimeType: "image/png" });
      await expect(service.calibrateByRatio(COMPANY_A, "t1", { ratio: 100, unit: "m" })).rejects.toThrow(/only works on a PDF/);
    });

    it("counts points without needing a scale", async () => {
      prisma.takeoff.findFirst.mockResolvedValue({ id: "t1", scalePixelLength: null, scaleRealLength: null, scaleUnit: null });
      await service.addMeasurement(COMPANY_A, "t1", { type: "count", label: "Outlets", points: [{ x: 1, y: 1 }, { x: 5, y: 5 }, { x: 9, y: 9 }] });
      expect(prisma.takeoffMeasurement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "count", value: 3, unit: "ea" }) }));
    });

    it("still needs a scale, and two points, for a length", async () => {
      prisma.takeoff.findFirst.mockResolvedValue({ id: "t1", scalePixelLength: null, scaleRealLength: null, scaleUnit: null });
      await expect(service.addMeasurement(COMPANY_A, "t1", { type: "length", label: "x", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).rejects.toThrow(/Calibrate/);
      await expect(service.addMeasurement(COMPANY_A, "t1", { type: "length", label: "x", points: [{ x: 0, y: 0 }] })).rejects.toThrow(/at least 2 points/);
    });
  });
});
