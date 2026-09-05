import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { LogCalibrationInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class CalibrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async log(companyId: string, actor: AuditActor, input: LogCalibrationInput) {
    let subjectName: string;
    if (input.toolCribItemId) {
      const item = await this.prisma.toolCribItem.findFirst({ where: { id: input.toolCribItemId, companyId } });
      if (!item) throw new NotFoundException("Tool crib item not found");
      subjectName = item.name;
    } else if (input.equipmentId) {
      const equipment = await this.prisma.equipment.findFirst({ where: { id: input.equipmentId, companyId } });
      if (!equipment) throw new NotFoundException("Equipment not found");
      subjectName = equipment.name;
    } else {
      throw new BadRequestException("Exactly one of toolCribItemId or equipmentId is required");
    }

    const record = await this.prisma.calibrationRecord.create({
      data: {
        companyId,
        toolCribItemId: input.toolCribItemId,
        equipmentId: input.equipmentId,
        calibratedAt: new Date(input.calibratedAt),
        nextDueAt: new Date(input.nextDueAt),
        certificateNumber: input.certificateNumber,
        performedBy: input.performedBy,
        notes: input.notes,
      },
    });
    this.audit.record(companyId, actor, "calibration.logged", "CalibrationRecord", record.id, `Logged calibration for "${subjectName}", next due ${input.nextDueAt.slice(0, 10)}`);
    return record;
  }

  history(companyId: string, toolCribItemId?: string, equipmentId?: string) {
    return this.prisma.calibrationRecord.findMany({
      where: { companyId, toolCribItemId, equipmentId },
      orderBy: { calibratedAt: "desc" },
    });
  }

  /**
   * "Due" list across both instrument types, one row per item (its most recent calibration only)
   * — a tool or equipment item with no calibration record at all is deliberately excluded, since
   * "never calibrated" and "not a calibrated instrument" look identical without a way to flag an
   * item as calibration-tracked (see the module's scope note on this).
   */
  async dueList(companyId: string, days = 30) {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const [tools, equipment] = await Promise.all([
      this.prisma.toolCribItem.findMany({
        where: { companyId, calibrationRecords: { some: {} } },
        include: { calibrationRecords: { orderBy: { calibratedAt: "desc" }, take: 1 } },
      }),
      this.prisma.equipment.findMany({
        where: { companyId, calibrationRecords: { some: {} } },
        include: { calibrationRecords: { orderBy: { calibratedAt: "desc" }, take: 1 } },
      }),
    ]);

    const rows = [
      ...tools.map((t) => ({ kind: "tool_crib_item" as const, id: t.id, name: t.name, latest: t.calibrationRecords[0] })),
      ...equipment.map((e) => ({ kind: "equipment" as const, id: e.id, name: e.name, latest: e.calibrationRecords[0] })),
    ]
      .filter((r) => r.latest.nextDueAt <= cutoff)
      .sort((a, b) => a.latest.nextDueAt.getTime() - b.latest.nextDueAt.getTime());

    return rows.map((r) => ({
      kind: r.kind,
      id: r.id,
      name: r.name,
      nextDueAt: r.latest.nextDueAt,
      overdue: r.latest.nextDueAt < new Date(),
    }));
  }
}
