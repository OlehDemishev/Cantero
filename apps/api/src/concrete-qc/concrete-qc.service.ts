import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddCylinderBreakInput,
  AddSlumpTestInput,
  CreateConcretePourInput,
  RecordCylinderBreakResultInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { classifyCylinderBreak } from "./classify-cylinder-break";

@Injectable()
export class ConcreteQcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listForProject(companyId: string, projectId: string) {
    return this.prisma.concretePour.findMany({
      where: { companyId, projectId },
      include: { slumpTests: true, cylinderBreaks: true },
      orderBy: { pourDate: "desc" },
    });
  }

  async createPour(companyId: string, actor: AuditActor, projectId: string, input: CreateConcretePourInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const pour = await this.prisma.concretePour.create({
      data: {
        companyId,
        projectId,
        location: input.location,
        pourDate: new Date(input.pourDate),
        mixDesign: input.mixDesign,
        volume: input.volume,
        specifiedStrength: input.specifiedStrength,
        specifiedSlump: input.specifiedSlump,
        supplierName: input.supplierName,
        notes: input.notes,
      },
    });
    this.audit.record(companyId, actor, "concrete_pour.created", "ConcretePour", pour.id, `Logged a pour at "${input.location}" on "${project.name}"`);
    return pour;
  }

  async addSlumpTest(companyId: string, pourId: string, input: AddSlumpTestInput) {
    const pour = await this.findPourOrThrow(companyId, pourId);
    return this.prisma.slumpTest.create({
      data: { pourId: pour.id, slumpValue: input.slumpValue, withinSpec: input.withinSpec, testedByName: input.testedByName, notes: input.notes },
    });
  }

  async addCylinderBreak(companyId: string, pourId: string, input: AddCylinderBreakInput) {
    await this.findPourOrThrow(companyId, pourId);
    return this.prisma.cylinderBreak.create({
      data: { pourId, cylinderLabel: input.cylinderLabel, breakAgeDays: input.breakAgeDays, breakDate: new Date(input.breakDate) },
    });
  }

  /** Fills in the actual break strength and classifies pass/fail against the parent pour's spec —
   * see classify-cylinder-break.ts. */
  async recordCylinderBreakResult(companyId: string, actor: AuditActor, id: string, input: RecordCylinderBreakResultInput) {
    const cylinderBreak = await this.prisma.cylinderBreak.findFirst({
      where: { id, pour: { companyId } },
      include: { pour: true },
    });
    if (!cylinderBreak) throw new NotFoundException("Cylinder break not found");

    const result = classifyCylinderBreak(input.breakStrength, cylinderBreak.pour.specifiedStrength !== null ? Number(cylinderBreak.pour.specifiedStrength) : null);
    const updated = await this.prisma.cylinderBreak.update({
      where: { id },
      data: { breakStrength: input.breakStrength, result: result ?? undefined, testedByName: input.testedByName, notes: input.notes },
    });
    this.audit.record(
      companyId,
      actor,
      "cylinder_break.recorded",
      "CylinderBreak",
      id,
      `Recorded cylinder "${cylinderBreak.cylinderLabel}" at ${input.breakStrength}${result ? ` (${result})` : ""}`,
    );
    return updated;
  }

  private async findPourOrThrow(companyId: string, id: string) {
    const pour = await this.prisma.concretePour.findFirst({ where: { id, companyId } });
    if (!pour) throw new NotFoundException("Concrete pour not found");
    return pour;
  }
}
