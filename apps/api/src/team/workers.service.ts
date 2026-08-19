import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateWorkerInput, UpdateWorkerInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class WorkersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.worker.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  async get(companyId: string, id: string) {
    const worker = await this.prisma.worker.findFirst({ where: { id, companyId } });
    if (!worker) throw new NotFoundException("Worker not found");
    return worker;
  }

  create(companyId: string, input: CreateWorkerInput) {
    return this.prisma.worker.create({ data: { ...input, companyId } });
  }

  async update(companyId: string, id: string, input: UpdateWorkerInput) {
    await this.get(companyId, id);
    return this.prisma.worker.update({ where: { id }, data: input });
  }

  /** Cumulative hours/cost for this worker, broken down by project — derived from TimeEntry. */
  async summary(companyId: string, id: string) {
    const worker = await this.get(companyId, id);
    const entries = await this.prisma.timeEntry.findMany({
      where: { companyId, workerId: id },
      include: { project: true },
      orderBy: { date: "desc" },
    });

    const byProject = new Map<string, { projectId: string; projectName: string; hours: number; cost: number }>();
    let totalHours = 0;
    let totalCost = 0;
    for (const entry of entries) {
      const hours = Number(entry.hours);
      const rate = entry.hourlyCostSnapshot !== null ? Number(entry.hourlyCostSnapshot) : Number(worker.hourlyCost ?? 0);
      const cost = hours * rate;
      totalHours += hours;
      totalCost += cost;

      const existing = byProject.get(entry.projectId);
      if (existing) {
        existing.hours += hours;
        existing.cost += cost;
      } else {
        byProject.set(entry.projectId, { projectId: entry.projectId, projectName: entry.project.name, hours, cost });
      }
    }

    return {
      worker,
      totalHours: Math.round(totalHours * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      byProject: Array.from(byProject.values())
        .map((p) => ({ ...p, hours: Math.round(p.hours * 100) / 100, cost: Math.round(p.cost * 100) / 100 }))
        .sort((a, b) => b.hours - a.hours),
    };
  }
}
