import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCompanyHolidayInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class CompanyHolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.companyHoliday.findMany({ where: { companyId }, orderBy: { date: "asc" } });
  }

  async create(companyId: string, actor: AuditActor, input: CreateCompanyHolidayInput) {
    const date = new Date(input.date);
    const existing = await this.prisma.companyHoliday.findUnique({ where: { companyId_date: { companyId, date } } });
    if (existing) throw new BadRequestException("A holiday is already set for this date");

    const holiday = await this.prisma.companyHoliday.create({ data: { companyId, date, label: input.label } });
    this.audit.record(companyId, actor, "company_holiday.added", "CompanyHoliday", holiday.id, `Added "${input.label}" as a non-working day`);
    return holiday;
  }

  async delete(companyId: string, actor: AuditActor, id: string) {
    const holiday = await this.prisma.companyHoliday.findFirst({ where: { id, companyId } });
    if (!holiday) throw new NotFoundException("Holiday not found");

    await this.prisma.companyHoliday.delete({ where: { id } });
    this.audit.record(companyId, actor, "company_holiday.removed", "CompanyHoliday", id, `Removed "${holiday.label}" from the holiday calendar`);
    return { ok: true };
  }

  /** Used by the task board to flag a due date that falls on a holiday — kept here rather than
   * exported as a standalone pure function since it needs the DB lookup; the actual weekday/
   * holiday-set check is the pure isWorkingDay() in projects/working-days.ts. */
  async holidayDateKeys(companyId: string): Promise<Set<string>> {
    const holidays = await this.list(companyId);
    return new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
  }
}
