import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateTimeOffRequestInput, DecideTimeOffRequestInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const HOURS_PER_DAY = 8;

/** Weekday count between two dates, inclusive of both ends — the simplest honest approximation
 * of "PTO days used" without a holiday calendar to subtract against. start/end arrive as UTC
 * midnight (the client sends a date-only picker value through `new Date(...).toISOString()`),
 * so this must walk and classify days in UTC too — mixing in the server process's local calendar
 * day (getDay()/setDate()) would shift every date by a day in any timezone behind UTC. */
function businessDaysInclusive(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

@Injectable()
export class TimeOffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.timeOffRequest.findMany({
      where: { companyId },
      include: { worker: { select: { id: true, name: true } } },
      orderBy: { startDate: "desc" },
    });
  }

  async create(companyId: string, actor: AuditActor, input: CreateTimeOffRequestInput) {
    const worker = await this.prisma.worker.findFirst({ where: { id: input.workerId, companyId } });
    if (!worker) throw new BadRequestException("Worker does not belong to this company");

    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (endDate < startDate) throw new BadRequestException("endDate can't be before startDate");

    const request = await this.prisma.timeOffRequest.create({
      data: { companyId, workerId: input.workerId, type: input.type, startDate, endDate, reason: input.reason },
      include: { worker: { select: { id: true, name: true } } },
    });

    this.audit.record(
      companyId,
      actor,
      "time_off.requested",
      "TimeOffRequest",
      request.id,
      `${worker.name} requested ${input.type} time off`,
    );
    return request;
  }

  async decide(companyId: string, actor: AuditActor, id: string, input: DecideTimeOffRequestInput) {
    const request = await this.prisma.timeOffRequest.findFirst({ where: { id, companyId }, include: { worker: true } });
    if (!request) throw new NotFoundException("Time off request not found");
    if (request.status !== "pending") throw new BadRequestException("This request has already been decided");

    const updated = await this.prisma.timeOffRequest.update({
      where: { id },
      data: {
        status: input.approve ? "approved" : "denied",
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
      },
      include: { worker: { select: { id: true, name: true } } },
    });

    // Only paid vacation draws down the balance — sick and unpaid leave don't touch it.
    if (input.approve && request.type === "vacation") {
      const hours = businessDaysInclusive(request.startDate, request.endDate) * HOURS_PER_DAY;
      await this.prisma.worker.update({ where: { id: request.workerId }, data: { ptoBalanceHours: { decrement: hours } } });
    }

    this.audit.record(
      companyId,
      actor,
      input.approve ? "time_off.approved" : "time_off.denied",
      "TimeOffRequest",
      id,
      `${input.approve ? "Approved" : "Denied"} ${request.worker.name}'s time off request`,
    );
    return updated;
  }
}
