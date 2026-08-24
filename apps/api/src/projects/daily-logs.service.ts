import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateDailyLogInput, UpdateDailyLogInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WeatherService } from "../weather/weather.service";

/** Normalizes any time-of-day to UTC midnight so `date` behaves as a calendar day for the unique constraint. */
function toCalendarDay(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class DailyLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly weather: WeatherService,
  ) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.dailyLog.findMany({ where: { projectId }, orderBy: { date: "desc" } });
  }

  async get(companyId: string, id: string) {
    const log = await this.prisma.dailyLog.findFirst({ where: { id, companyId } });
    if (!log) throw new NotFoundException("Daily log not found");
    return log;
  }

  async create(companyId: string, actor: AuditActor, input: CreateDailyLogInput) {
    const project = await this.assertProject(companyId, input.projectId);
    const date = toCalendarDay(input.date);

    const existing = await this.prisma.dailyLog.findUnique({
      where: { projectId_date: { projectId: input.projectId, date } },
    });
    if (existing) throw new BadRequestException("A daily log already exists for this date — edit it instead");

    let weatherCondition = input.weatherCondition;
    let weatherNotes = input.weatherNotes;
    if (!weatherCondition && project.address) {
      const forecast = await this.weather.forecastForDate(project.address, date);
      if (forecast) {
        weatherCondition = forecast.condition;
        weatherNotes = weatherNotes ?? `Auto-filled from forecast: ${forecast.tempMinC}–${forecast.tempMaxC}°C`;
      }
    }

    const log = await this.prisma.dailyLog.create({
      data: {
        companyId,
        projectId: input.projectId,
        date,
        authorUserId: actor.userId,
        authorName: actor.name,
        weatherCondition,
        weatherNotes,
        crewCount: input.crewCount,
        crewNotes: input.crewNotes,
        workPerformed: input.workPerformed,
        delays: input.delays,
        notes: input.notes,
      },
    });

    this.audit.record(companyId, actor, "daily_log.created", "DailyLog", log.id, `Logged ${date.toISOString().slice(0, 10)} on "${project.name}"`);
    return log;
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdateDailyLogInput) {
    const log = await this.get(companyId, id);
    return this.prisma.dailyLog.update({
      where: { id: log.id },
      data: input,
    });
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
