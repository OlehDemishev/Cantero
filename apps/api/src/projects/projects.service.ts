import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateProjectInput, UpdateProjectWarrantyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { WeatherService } from "../weather/weather.service";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weather: WeatherService,
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
}
