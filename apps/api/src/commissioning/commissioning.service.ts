import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddCommissioningChecklistItemInput,
  AddFunctionalTestInput,
  CreateCommissioningSystemInput,
  ScheduleOwnerTrainingInput,
  SignOffOwnerTrainingInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class CommissioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listForProject(companyId: string, projectId: string) {
    return this.prisma.commissioningSystem.findMany({
      where: { companyId, projectId },
      include: { checklistItems: true, functionalTests: true, trainingSessions: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async createSystem(companyId: string, actor: AuditActor, projectId: string, input: CreateCommissioningSystemInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const system = await this.prisma.commissioningSystem.create({
      data: { companyId, projectId, name: input.name, category: input.category },
    });
    this.audit.record(companyId, actor, "commissioning_system.created", "CommissioningSystem", system.id, `Added commissioning system "${input.name}" to "${project.name}"`);
    return system;
  }

  async addChecklistItem(companyId: string, systemId: string, input: AddCommissioningChecklistItemInput) {
    await this.findSystemOrThrow(companyId, systemId);
    return this.prisma.commissioningChecklistItem.create({ data: { systemId, description: input.description } });
  }

  async toggleChecklistItem(companyId: string, id: string, completedByName: string) {
    const item = await this.prisma.commissioningChecklistItem.findFirst({ where: { id, system: { companyId } } });
    if (!item) throw new NotFoundException("Checklist item not found");
    const updated = await this.prisma.commissioningChecklistItem.update({
      where: { id },
      data: item.done ? { done: false, completedAt: null, completedByName: null } : { done: true, completedAt: new Date(), completedByName },
    });
    await this.recomputeStatus(item.systemId);
    return updated;
  }

  /** Recomputes status from what's actually recorded rather than trusting a manually-set status:
   * any failed test reopens testing, all-pass + all-checklist-done marks complete, otherwise
   * pending_testing/testing depending on whether any test has been logged yet. */
  async addFunctionalTest(companyId: string, actor: AuditActor, systemId: string, input: AddFunctionalTestInput) {
    const system = await this.findSystemOrThrow(companyId, systemId);
    const test = await this.prisma.functionalTest.create({
      data: { systemId, procedure: input.procedure, result: input.result, testedByName: input.testedByName, notes: input.notes },
    });
    this.audit.record(companyId, actor, "functional_test.recorded", "FunctionalTest", test.id, `Logged a ${input.result} functional test on "${system.name}"`);
    await this.recomputeStatus(systemId);
    return test;
  }

  async scheduleOwnerTraining(companyId: string, actor: AuditActor, systemId: string, input: ScheduleOwnerTrainingInput) {
    const system = await this.findSystemOrThrow(companyId, systemId);
    const session = await this.prisma.ownerTrainingSession.create({
      data: { systemId, trainerName: input.trainerName, trainingDate: new Date(input.trainingDate), attendeeNames: input.attendeeNames },
    });
    this.audit.record(companyId, actor, "owner_training_session.scheduled", "OwnerTrainingSession", session.id, `Scheduled owner training for "${system.name}"`);
    return session;
  }

  async signOffOwnerTraining(companyId: string, actor: AuditActor, id: string, input: SignOffOwnerTrainingInput) {
    const session = await this.prisma.ownerTrainingSession.findFirst({ where: { id, system: { companyId } }, include: { system: true } });
    if (!session) throw new NotFoundException("Training session not found");
    const updated = await this.prisma.ownerTrainingSession.update({
      where: { id },
      data: { ownerSignedOffAt: new Date(), ownerSignerName: input.ownerSignerName },
    });
    this.audit.record(companyId, actor, "owner_training_session.signed_off", "OwnerTrainingSession", id, `${input.ownerSignerName} signed off training on "${session.system.name}"`);
    await this.recomputeStatus(session.systemId);
    return updated;
  }

  private async recomputeStatus(systemId: string) {
    const system = await this.prisma.commissioningSystem.findUniqueOrThrow({
      where: { id: systemId },
      include: { checklistItems: true, functionalTests: true, trainingSessions: true },
    });

    // Only the most recent test's result gates completion — an earlier failed attempt that was
    // later retested and passed shouldn't block the system forever (see the bug this replaced:
    // "has any test ever failed" never clears once a single retry fails).
    const latestTest = [...system.functionalTests].sort((a, b) => b.testedAt.getTime() - a.testedAt.getTime())[0];
    const latestTestPassed = latestTest?.result === "pass";
    const allChecklistDone = system.checklistItems.length > 0 && system.checklistItems.every((c) => c.done);
    const trainingSignedOff = system.trainingSessions.length === 0 || system.trainingSessions.every((s) => s.ownerSignedOffAt !== null);

    const status = !latestTest
      ? "pending_testing"
      : !latestTestPassed
        ? "testing"
        : allChecklistDone && trainingSignedOff
          ? "complete"
          : "testing";

    if (status !== system.status) {
      await this.prisma.commissioningSystem.update({ where: { id: systemId }, data: { status } });
    }
  }

  private async findSystemOrThrow(companyId: string, id: string) {
    const system = await this.prisma.commissioningSystem.findFirst({ where: { id, companyId } });
    if (!system) throw new NotFoundException("Commissioning system not found");
    return system;
  }
}
