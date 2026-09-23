import { Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type { AddWorkerCertificationInput, AdjustPtoBalanceInput, CreateWorkerInput, UpdateWorkerInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { RateLimiterService } from "../common/rate-limiter/rate-limiter.service";
import { calculateLoadedLaborRate } from "./labor-burden";

const PIN_BCRYPT_ROUNDS = 10;
const PIN_VERIFY_LIMIT = 10;
const PIN_VERIFY_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class WorkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async list(companyId: string) {
    const workers = await this.prisma.worker.findMany({ where: { companyId }, orderBy: { name: "asc" }, omit: { clockInPinHash: false } });
    return workers.map((w) => this.redactPin(w));
  }

  async get(companyId: string, id: string) {
    const worker = await this.getRaw(companyId, id);
    return this.redactPin(worker);
  }

  /** Fully-loaded hourly cost for one worker — null when the worker has no hourlyCost set,
   * same "nothing to compute" convention as elsewhere in this codebase, rather than treating
   * an unset base rate as zero. */
  async loadedRate(companyId: string, id: string) {
    const [worker, company] = await Promise.all([
      this.getRaw(companyId, id),
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: {
          payrollTaxBurdenPercent: true,
          workersCompBurdenPercent: true,
          benefitsBurdenPercent: true,
          otherBurdenPercent: true,
        },
      }),
    ]);
    if (worker.hourlyCost === null) return null;

    return calculateLoadedLaborRate(Number(worker.hourlyCost), {
      payrollTaxBurdenPercent: company.payrollTaxBurdenPercent !== null ? Number(company.payrollTaxBurdenPercent) : null,
      workersCompBurdenPercent: company.workersCompBurdenPercent !== null ? Number(company.workersCompBurdenPercent) : null,
      benefitsBurdenPercent: company.benefitsBurdenPercent !== null ? Number(company.benefitsBurdenPercent) : null,
      otherBurdenPercent: company.otherBurdenPercent !== null ? Number(company.otherBurdenPercent) : null,
    });
  }

  /** Internal-only lookup that keeps clockInPinHash — verifyClockInPin needs the real hash to
   * compare against; every externally-facing read goes through get()/list(), which redact it. */
  private async getRaw(companyId: string, id: string) {
    const worker = await this.prisma.worker.findFirst({ where: { id, companyId }, omit: { clockInPinHash: false } });
    if (!worker) throw new NotFoundException("Worker not found");
    return worker;
  }

  /** Never send the PIN hash to the client — hasClockInPin is all the frontend needs to know. */
  private redactPin<T extends { clockInPinHash: string | null }>(worker: T) {
    const { clockInPinHash, ...rest } = worker;
    return { ...rest, hasClockInPin: clockInPinHash !== null };
  }

  /** Clones the company's onboarding template into fresh tasks for this worker — a snapshot at
   * creation time, so editing the template later never rewrites tasks already assigned. */
  async create(companyId: string, input: CreateWorkerInput) {
    const worker = await this.prisma.worker.create({ omit: { clockInPinHash: false }, data: { ...input, companyId } });

    const templateItems = await this.prisma.onboardingTemplateItem.findMany({
      where: { companyId },
      orderBy: { sortOrder: "asc" },
    });
    if (templateItems.length > 0) {
      await this.prisma.workerOnboardingTask.createMany({
        data: templateItems.map((item) => ({
          companyId,
          workerId: worker.id,
          title: item.title,
          sortOrder: item.sortOrder,
        })),
      });
    }
    return worker;
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdateWorkerInput) {
    const before = await this.get(companyId, id);
    const worker = await this.prisma.worker.update({ omit: { clockInPinHash: false }, where: { id }, data: input });

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
      if (!input.active) await this.cloneOffboardingTemplate(companyId, id);
    }
    return this.redactPin(worker);
  }

  /** Same clone-the-template-into-fresh-tasks pattern as create()'s onboarding clone, triggered
   * the moment a worker is deactivated rather than at creation. Only clones once — if the worker
   * is reactivated and later deactivated again, any tasks left over from the first departure stay
   * as-is rather than duplicating. */
  private async cloneOffboardingTemplate(companyId: string, workerId: string) {
    const alreadyCloned = await this.prisma.workerOffboardingTask.count({ where: { companyId, workerId } });
    if (alreadyCloned > 0) return;

    const templateItems = await this.prisma.offboardingTemplateItem.findMany({
      where: { companyId },
      orderBy: { sortOrder: "asc" },
    });
    if (templateItems.length === 0) return;

    await this.prisma.workerOffboardingTask.createMany({
      data: templateItems.map((item) => ({ companyId, workerId, title: item.title, sortOrder: item.sortOrder })),
    });
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

  async adjustPtoBalance(companyId: string, actor: AuditActor, workerId: string, input: AdjustPtoBalanceInput) {
    const worker = await this.get(companyId, workerId);
    // Returned as is: the PIN hash is left out of every query by default (PrismaService GLOBAL_OMIT).
    const updated = await this.prisma.worker.update({
      where: { id: workerId },
      data: { ptoBalanceHours: { increment: input.deltaHours } },
    });
    this.audit.record(
      companyId,
      actor,
      "worker.pto_balance_adjusted",
      "Worker",
      workerId,
      `${input.deltaHours > 0 ? "Added" : "Deducted"} ${Math.abs(input.deltaHours)}h ${input.deltaHours > 0 ? "to" : "from"} ${worker.name}'s PTO balance — ${input.reason}`,
      { deltaHours: input.deltaHours, reason: input.reason },
    );
    return updated;
  }

  listOnboardingTasks(companyId: string, workerId: string) {
    return this.prisma.workerOnboardingTask.findMany({
      where: { companyId, workerId },
      orderBy: { sortOrder: "asc" },
    });
  }

  async toggleOnboardingTask(companyId: string, workerId: string, taskId: string) {
    const task = await this.prisma.workerOnboardingTask.findFirst({ where: { id: taskId, companyId, workerId } });
    if (!task) throw new NotFoundException("Onboarding task not found");
    return this.prisma.workerOnboardingTask.update({
      where: { id: taskId },
      data: { done: !task.done, completedAt: !task.done ? new Date() : null },
    });
  }

  listOffboardingTasks(companyId: string, workerId: string) {
    return this.prisma.workerOffboardingTask.findMany({
      where: { companyId, workerId },
      orderBy: { sortOrder: "asc" },
    });
  }

  async toggleOffboardingTask(companyId: string, workerId: string, taskId: string) {
    const task = await this.prisma.workerOffboardingTask.findFirst({ where: { id: taskId, companyId, workerId } });
    if (!task) throw new NotFoundException("Offboarding task not found");
    return this.prisma.workerOffboardingTask.update({
      where: { id: taskId },
      data: { done: !task.done, completedAt: !task.done ? new Date() : null },
    });
  }

  /** Lets an admin set the PIN this worker uses to identify themselves on a shared kiosk device
   * — see Worker.clockInPinHash. */
  async setClockInPin(companyId: string, actor: AuditActor, workerId: string, pin: string) {
    await this.get(companyId, workerId);
    const clockInPinHash = await bcrypt.hash(pin, PIN_BCRYPT_ROUNDS);
    await this.prisma.worker.update({ where: { id: workerId }, data: { clockInPinHash } });
    this.audit.record(companyId, actor, "worker.clock_in_pin_set", "Worker", workerId, "Set a kiosk clock-in PIN");
    return { ok: true };
  }

  async clearClockInPin(companyId: string, actor: AuditActor, workerId: string) {
    await this.get(companyId, workerId);
    await this.prisma.worker.update({ where: { id: workerId }, data: { clockInPinHash: null } });
    this.audit.record(companyId, actor, "worker.clock_in_pin_cleared", "Worker", workerId, "Cleared the kiosk clock-in PIN");
    return { ok: true };
  }

  /** Company-scoped, not a general-purpose auth check — the kiosk device is already inside an
   * authenticated session (someone logged in), so a false PIN here just means "try again", not
   * "attacker detected". Still rate-limited per worker: a typical PIN is only 4-6 digits, cheap
   * to brute-force by a coworker at the same kiosk without some limit. */
  async verifyClockInPin(companyId: string, workerId: string, pin: string): Promise<{ valid: boolean }> {
    this.rateLimiter.consume(`clock-in-pin:${companyId}:${workerId}`, PIN_VERIFY_LIMIT, PIN_VERIFY_WINDOW_MS);
    const worker = await this.getRaw(companyId, workerId);
    if (!worker.clockInPinHash) return { valid: false };
    const valid = await bcrypt.compare(pin, worker.clockInPinHash);
    if (valid) this.rateLimiter.reset(`clock-in-pin:${companyId}:${workerId}`);
    return { valid };
  }

  /** Every active worker with a kiosk PIN set — the roster a kiosk device shows to pick from,
   * deliberately excluding anyone kiosk clock-in hasn't been turned on for. */
  listKioskWorkers(companyId: string) {
    return this.prisma.worker.findMany({
      where: { companyId, active: true, clockInPinHash: { not: null } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }
}
