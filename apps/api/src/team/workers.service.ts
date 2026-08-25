import { Injectable, NotFoundException } from "@nestjs/common";
import type { AddWorkerCertificationInput, CreateWorkerInput, UpdateWorkerInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class WorkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

  async update(companyId: string, actor: AuditActor, id: string, input: UpdateWorkerInput) {
    const before = await this.get(companyId, id);
    const worker = await this.prisma.worker.update({ where: { id }, data: input });

    if (input.hourlyCost !== undefined && Number(before.hourlyCost) !== Number(input.hourlyCost)) {
      this.audit.record(
        companyId,
        actor,
        "worker.rate_changed",
        "Worker",
        id,
        `Changed hourly rate for ${worker.name} from ${before.hourlyCost ?? "—"} to ${input.hourlyCost ?? "—"}`,
        { before: before.hourlyCost, after: input.hourlyCost },
      );
    }
    if (input.active !== undefined && before.active !== input.active) {
      this.audit.record(
        companyId,
        actor,
        input.active ? "worker.reactivated" : "worker.deactivated",
        "Worker",
        id,
        `${input.active ? "Reactivated" : "Deactivated"} worker ${worker.name}`,
      );
    }
    return worker;
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

  listCertifications(companyId: string, workerId: string) {
    return this.prisma.workerCertification.findMany({
      where: { companyId, workerId },
      orderBy: { expiresAt: "asc" },
    });
  }

  async addCertification(companyId: string, actor: AuditActor, workerId: string, input: AddWorkerCertificationInput) {
    const worker = await this.get(companyId, workerId);
    const cert = await this.prisma.workerCertification.create({
      data: { companyId, workerId, name: input.name, expiresAt: new Date(input.expiresAt) },
    });
    this.audit.record(
      companyId,
      actor,
      "worker_certification.added",
      "WorkerCertification",
      cert.id,
      `Added "${input.name}" for ${worker.name}, expires ${cert.expiresAt.toLocaleDateString()}`,
    );
    return cert;
  }

  async deleteCertification(companyId: string, workerId: string, certificationId: string) {
    const cert = await this.prisma.workerCertification.findFirst({ where: { id: certificationId, workerId, companyId } });
    if (!cert) throw new NotFoundException("Certification not found");
    await this.prisma.workerCertification.delete({ where: { id: certificationId } });
    return { ok: true };
  }

  /** Every active worker's certifications in one list, bucketed by expiry so a foreman can see
   * at a glance who's expired, who's expiring inside 30 days, and who's clear — without opening
   * each worker one at a time. */
  async certificationsDashboard(companyId: string) {
    const certs = await this.prisma.workerCertification.findMany({
      where: { companyId, worker: { active: true } },
      include: { worker: { select: { id: true, name: true, role: true } } },
      orderBy: { expiresAt: "asc" },
    });

    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const bucketed = certs.map((c) => ({
      id: c.id,
      name: c.name,
      expiresAt: c.expiresAt,
      worker: c.worker,
      status: c.expiresAt < now ? ("expired" as const) : c.expiresAt < soonThreshold ? ("expiring_soon" as const) : ("valid" as const),
    }));

    return {
      certifications: bucketed,
      summary: {
        expired: bucketed.filter((c) => c.status === "expired").length,
        expiringSoon: bucketed.filter((c) => c.status === "expiring_soon").length,
        valid: bucketed.filter((c) => c.status === "valid").length,
      },
    };
  }
}
