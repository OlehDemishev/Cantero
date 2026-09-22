import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CalibrateTakeoffByRatioInput, CalibrateTakeoffInput, CreateTakeoffMeasurementInput, TakeoffRatioUnit } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { pdfPageCount } from "../drawings/pdf-text";
import { polygonAreaPixels, polylineLengthPixels, scaleToReal, type Point } from "./takeoff-geometry";

const TAKEOFF_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
/** PDF units per inch: a PDF takeoff's points are in these, so a printed scale converts exactly. */
const PDF_UNITS_PER_INCH = 72;
const UNIT_PER_INCH: Record<TakeoffRatioUnit, number> = { m: 0.0254, cm: 2.54, mm: 25.4, ft: 1 / 12, in: 1 };
/** Stored unit for a count, shown as "pcs"/"Stk." by the UI. */
export const COUNT_UNIT = "ea";

@Injectable()
export class TakeoffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  list(companyId: string, projectId: string) {
    return this.prisma.takeoff.findMany({ where: { companyId, projectId }, orderBy: { createdAt: "desc" } });
  }

  async get(companyId: string, id: string) {
    const takeoff = await this.prisma.takeoff.findFirst({
      where: { id, companyId },
      include: { measurements: { include: { rateCatalogItem: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!takeoff) throw new NotFoundException("Takeoff not found");
    return takeoff;
  }

  async create(companyId: string, projectId: string, name: string, file: Express.Multer.File, pageNumber = 1) {
    if (!TAKEOFF_MIME_TYPES.has(file.mimetype)) throw new BadRequestException("Upload a PDF, JPEG, PNG or WebP drawing");
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    const page = await this.checkedPage(file.mimetype, file.buffer, pageNumber);

    const stored = await this.storage.save(companyId, file.originalname, file.buffer);
    return this.prisma.takeoff.create({
      data: { companyId, projectId, name, imageStorageKey: stored.storageKey, imageMimeType: file.mimetype, pageNumber: page },
    });
  }

  /** Measures a Plan room sheet in place: the takeoff points at the sheet's own stored file. */
  async createFromSheet(companyId: string, projectId: string, sheetId: string, name?: string) {
    const sheet = await this.prisma.drawingSheet.findFirst({ where: { id: sheetId, companyId, projectId } });
    if (!sheet) throw new NotFoundException("Drawing sheet not found");
    return this.prisma.takeoff.create({
      data: {
        companyId,
        projectId,
        name: (name?.trim() || [sheet.sheetNumber, sheet.title].filter(Boolean).join(" ")).slice(0, 160),
        imageStorageKey: sheet.storageKey,
        imageMimeType: sheet.mimeType,
        sourceSheetId: sheet.id,
      },
    });
  }

  private async checkedPage(mimeType: string, buffer: Buffer, pageNumber: number): Promise<number> {
    if (mimeType !== "application/pdf") return 1;
    if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new BadRequestException("Page numbers start at 1");
    const pages = await pdfPageCount(buffer).catch(() => {
      throw new BadRequestException("This PDF couldn't be read — it may be damaged or password-protected");
    });
    if (pageNumber > pages) throw new BadRequestException(`This PDF has ${pages} page${pages === 1 ? "" : "s"}`);
    return pageNumber;
  }

  async image(companyId: string, id: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const takeoff = await this.prisma.takeoff.findFirst({ where: { id, companyId } });
    if (!takeoff) throw new NotFoundException("Takeoff not found");
    const buffer = await this.storage.read(takeoff.imageStorageKey);
    return { buffer, mimeType: takeoff.imageMimeType };
  }

  async calibrate(companyId: string, id: string, input: CalibrateTakeoffInput) {
    const takeoff = await this.prisma.takeoff.findFirst({ where: { id, companyId } });
    if (!takeoff) throw new NotFoundException("Takeoff not found");
    return this.prisma.takeoff.update({
      where: { id },
      data: { scalePixelLength: input.scalePixelLength, scaleRealLength: input.scaleRealLength, scaleUnit: input.scaleUnit },
    });
  }

  /**
   * Sets a PDF takeoff's scale from the ratio printed on the drawing (1:100, 1/4" = 1'-0" → 48)
   * instead of tracing a known length. Exact for a PDF, whose points are in 1/72 inch of paper;
   * it assumes the PDF is at its true paper size — a set exported "fit to page" needs a traced
   * calibration instead.
   */
  async calibrateByRatio(companyId: string, id: string, input: CalibrateTakeoffByRatioInput) {
    const takeoff = await this.prisma.takeoff.findFirst({ where: { id, companyId } });
    if (!takeoff) throw new NotFoundException("Takeoff not found");
    if (takeoff.imageMimeType !== "application/pdf") throw new BadRequestException("A scale ratio only works on a PDF — calibrate an image by tracing a known length");
    return this.prisma.takeoff.update({
      where: { id },
      data: { scalePixelLength: PDF_UNITS_PER_INCH, scaleRealLength: input.ratio * UNIT_PER_INCH[input.unit], scaleUnit: input.unit },
    });
  }

  async delete(companyId: string, id: string) {
    const takeoff = await this.prisma.takeoff.findFirst({ where: { id, companyId } });
    if (!takeoff) throw new NotFoundException("Takeoff not found");
    await this.prisma.takeoff.delete({ where: { id } });
  }

  /** Computes the measurement's real-world value server-side from its raw pixel points and the
   * takeoff's calibration — the client only ever supplies geometry, never a trusted final value. */
  async addMeasurement(companyId: string, takeoffId: string, input: CreateTakeoffMeasurementInput) {
    const takeoff = await this.prisma.takeoff.findFirst({ where: { id: takeoffId, companyId } });
    if (!takeoff) throw new NotFoundException("Takeoff not found");
    if (input.type === "area" && input.points.length < 3) {
      throw new BadRequestException("An area measurement needs at least 3 points");
    }
    if (input.type === "length" && input.points.length < 2) {
      throw new BadRequestException("A length measurement needs at least 2 points");
    }
    if (input.rateCatalogItemId) {
      const owned = await this.prisma.rateCatalogItem.count({ where: { id: input.rateCatalogItemId, companyId } });
      if (!owned) throw new NotFoundException("Rate catalog item not found");
    }

    // A count needs no scale; lengths and areas do.
    if (input.type === "count") {
      return this.prisma.takeoffMeasurement.create({
        data: { takeoffId, type: "count", label: input.label, points: input.points, value: input.points.length, unit: COUNT_UNIT, rateCatalogItemId: input.rateCatalogItemId },
        include: { rateCatalogItem: true },
      });
    }
    if (takeoff.scalePixelLength === null || takeoff.scaleRealLength === null || takeoff.scaleUnit === null) {
      throw new BadRequestException("Calibrate this takeoff before adding measurements");
    }

    const points: Point[] = input.points;
    const pixelValue = input.type === "length" ? polylineLengthPixels(points) : polygonAreaPixels(points);
    const value = scaleToReal(pixelValue, Number(takeoff.scalePixelLength), Number(takeoff.scaleRealLength), input.type);

    return this.prisma.takeoffMeasurement.create({
      data: {
        takeoffId,
        type: input.type,
        label: input.label,
        points: input.points,
        value,
        unit: input.type === "length" ? takeoff.scaleUnit : `${takeoff.scaleUnit}²`,
        rateCatalogItemId: input.rateCatalogItemId,
      },
      include: { rateCatalogItem: true },
    });
  }

  async deleteMeasurement(companyId: string, takeoffId: string, measurementId: string) {
    const measurement = await this.prisma.takeoffMeasurement.findFirst({
      where: { id: measurementId, takeoffId, takeoff: { companyId } },
    });
    if (!measurement) throw new NotFoundException("Measurement not found");
    await this.prisma.takeoffMeasurement.delete({ where: { id: measurement.id } });
  }
}
