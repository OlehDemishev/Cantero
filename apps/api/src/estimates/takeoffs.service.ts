import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CalibrateTakeoffInput, CreateTakeoffMeasurementInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { polygonAreaPixels, polylineLengthPixels, scaleToReal, type Point } from "./takeoff-geometry";

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

  async create(companyId: string, projectId: string, name: string, file: Express.Multer.File) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const stored = await this.storage.save(companyId, file.originalname, file.buffer);
    return this.prisma.takeoff.create({
      data: { companyId, projectId, name, imageStorageKey: stored.storageKey, imageMimeType: file.mimetype },
    });
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
    if (takeoff.scalePixelLength === null || takeoff.scaleRealLength === null || takeoff.scaleUnit === null) {
      throw new BadRequestException("Calibrate this takeoff before adding measurements");
    }
    if (input.type === "area" && input.points.length < 3) {
      throw new BadRequestException("An area measurement needs at least 3 points");
    }
    if (input.rateCatalogItemId) {
      const owned = await this.prisma.rateCatalogItem.count({ where: { id: input.rateCatalogItemId, companyId } });
      if (!owned) throw new NotFoundException("Rate catalog item not found");
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
