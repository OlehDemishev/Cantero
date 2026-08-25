import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateProjectInput, ImportResult, UpdateProjectGeofenceInput, UpdateProjectWarrantyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { WeatherService } from "../weather/weather.service";
import { parseCsvRecords } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weather: WeatherService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.project.findMany({
      where: { companyId },
      include: { client: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, companyId },
      include: { client: true },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  /** Best-effort 5-day-ahead forecast for the project's site, geocoded from its free-text address. `available: false` means no address is set or the location couldn't be resolved — not an error, just nothing to show. */
  async weatherForecast(companyId: string, id: string) {
    const project = await this.get(companyId, id);
    if (!project.address) return { available: false as const, days: [] };

    const coords = await this.weather.geocode(project.address);
    if (!coords) return { available: false as const, days: [] };

    const days = await this.weather.forecast(coords.lat, coords.lon, 0);
    return { available: true as const, days };
  }

  async create(companyId: string, input: CreateProjectInput) {
    if (input.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: input.clientId, companyId } });
      if (!client) throw new NotFoundException("Client not found");
    }
    return this.prisma.project.create({ data: { ...input, companyId } });
  }

  /** Best-effort lat/lng for the project's free-text address, to pre-fill the geofence-setup form. Returns null if there's no address or it can't be resolved. */
  async geocode(companyId: string, id: string) {
    const project = await this.get(companyId, id);
    if (!project.address) return null;
    return this.weather.geocode(project.address);
  }

  async updateGeofence(companyId: string, id: string, input: UpdateProjectGeofenceInput) {
    await this.get(companyId, id);
    return this.prisma.project.update({
      where: { id },
      data: { geofenceLat: input.lat, geofenceLng: input.lng, geofenceRadiusMeters: input.radiusMeters },
      include: { client: true },
    });
  }

  async clearGeofence(companyId: string, id: string) {
    await this.get(companyId, id);
    return this.prisma.project.update({
      where: { id },
      data: { geofenceLat: null, geofenceLng: null, geofenceRadiusMeters: null },
      include: { client: true },
    });
  }

  async updateWarranty(companyId: string, id: string, input: UpdateProjectWarrantyInput) {
    await this.get(companyId, id);
    return this.prisma.project.update({
      where: { id },
      data: {
        handoverDate: input.handoverDate === null ? null : input.handoverDate ? new Date(input.handoverDate) : undefined,
        warrantyMonths: input.warrantyMonths,
      },
      include: { client: true },
    });
  }

  /**
   * CSV columns: name (required), address, client (optional — matched case-insensitively
   * against this company's existing client names). An unmatched client name doesn't fail the
   * row: the project is still created without a client link, since the name/address are still
   * useful data and a typo in one column shouldn't sink an otherwise-good bulk import.
   */
  async importCsv(companyId: string, actor: AuditActor, csv: string): Promise<ImportResult> {
    const records = parseCsvRecords(csv);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    const clients = await this.prisma.client.findMany({ where: { companyId }, select: { id: true, name: true } });
    const clientIdByName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c.id]));

    const toCreate: { name: string; address: string | null; clientId: string | null }[] = [];

    records.forEach((record, index) => {
      const row = index + 2; // header is row 1
      const name = record.name?.trim();
      if (!name) {
        result.skipped++;
        result.errors.push({ row, message: "Missing name" });
        return;
      }
      const clientName = record.client?.trim();
      const clientId = clientName ? (clientIdByName.get(clientName.toLowerCase()) ?? null) : null;
      toCreate.push({ name, address: record.address?.trim() || null, clientId });
    });

    if (toCreate.length > 0) {
      await this.prisma.project.createMany({ data: toCreate.map((p) => ({ ...p, companyId })) });
      result.created = toCreate.length;
    }

    this.audit.record(
      companyId,
      actor,
      "projects.imported",
      "Company",
      companyId,
      `Imported ${result.created} projects from CSV (${result.skipped} skipped)`,
    );

    return result;
  }
}
