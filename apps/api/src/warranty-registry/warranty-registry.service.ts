import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateWarrantyRegistrationInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { addMonthsUtc } from "../common/date-utils";

@Injectable()
export class WarrantyRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listForProject(companyId: string, projectId: string) {
    return this.prisma.warrantyRegistration.findMany({ where: { companyId, projectId }, orderBy: { expirationDate: "asc" } });
  }

  async create(companyId: string, actor: AuditActor, projectId: string, input: CreateWarrantyRegistrationInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const startDate = new Date(input.startDate);
    const expirationDate = addMonthsUtc(startDate, input.termMonths);

    const registration = await this.prisma.warrantyRegistration.create({
      data: {
        companyId,
        projectId,
        scope: input.scope,
        manufacturer: input.manufacturer,
        coverageType: input.coverageType,
        termMonths: input.termMonths,
        startDate,
        expirationDate,
        notes: input.notes,
      },
    });
    this.audit.record(companyId, actor, "warranty_registration.created", "WarrantyRegistration", registration.id, `Registered "${input.scope}" warranty on "${project.name}"`);
    return registration;
  }

  /** Company-wide registrations expiring within `days` — the renewal/upsell-alert dashboard. */
  expiringWithin(companyId: string, days: number) {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.prisma.warrantyRegistration.findMany({
      where: { companyId, expirationDate: { lte: cutoff } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { expirationDate: "asc" },
    });
  }
}
