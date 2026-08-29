import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AcknowledgeJhaInput, CreateJhaInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const INCLUDE_ACKNOWLEDGMENTS = { acknowledgments: { include: { worker: { select: { id: true, name: true } } } } } as const;

@Injectable()
export class JhaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.jobHazardAnalysis.findMany({ where: { projectId }, include: INCLUDE_ACKNOWLEDGMENTS, orderBy: { date: "desc" } });
  }

  async create(companyId: string, actor: AuditActor, input: CreateJhaInput) {
    const project = await this.assertProject(companyId, input.projectId);
    if (input.taskId) {
      const task = await this.prisma.task.findFirst({ where: { id: input.taskId, projectId: input.projectId } });
      if (!task) throw new NotFoundException("Task not found");
    }
    await this.assertWorkers(companyId, input.acknowledgedWorkerIds);

    const jha = await this.prisma.jobHazardAnalysis.create({
      data: {
        companyId,
        projectId: input.projectId,
        taskId: input.taskId,
        date: new Date(input.date),
        taskDescription: input.taskDescription,
        hazards: input.hazards,
        controlMeasures: input.controlMeasures,
        requiredPpe: input.requiredPpe,
        conductedByUserId: actor.userId,
        conductedByName: actor.name,
        acknowledgments: { create: input.acknowledgedWorkerIds.map((workerId) => ({ workerId })) },
      },
      include: INCLUDE_ACKNOWLEDGMENTS,
    });
    this.audit.record(
      companyId,
      actor,
      "jha.created",
      "JobHazardAnalysis",
      jha.id,
      `Logged JHA for "${input.taskDescription}" on "${project.name}" (${input.acknowledgedWorkerIds.length} acknowledged)`,
    );
    return jha;
  }

  async acknowledge(companyId: string, id: string, input: AcknowledgeJhaInput) {
    const jha = await this.prisma.jobHazardAnalysis.findFirst({ where: { id, companyId } });
    if (!jha) throw new NotFoundException("JHA not found");
    await this.assertWorkers(companyId, input.workerIds);

    await this.prisma.jhaAcknowledgment.createMany({
      data: input.workerIds.map((workerId) => ({ jhaId: id, workerId })),
      skipDuplicates: true,
    });
    return this.prisma.jobHazardAnalysis.findUniqueOrThrow({ where: { id }, include: INCLUDE_ACKNOWLEDGMENTS });
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private async assertWorkers(companyId: string, workerIds: string[]) {
    if (workerIds.length === 0) return;
    const count = await this.prisma.worker.count({ where: { id: { in: workerIds }, companyId } });
    if (count !== new Set(workerIds).size) throw new BadRequestException("One or more workers do not belong to this company");
  }
}
