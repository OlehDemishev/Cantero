import { Injectable } from "@nestjs/common";
import type { UpdateCompanyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }

  async update(companyId: string, actor: AuditActor, input: UpdateCompanyInput) {
    const updated = await this.prisma.company.update({ where: { id: companyId }, data: input });
    this.audit.record(companyId, actor, "company.settings_updated", "Company", companyId, "Updated company settings", input);
    return updated;
  }

  async completeOnboarding(companyId: string, actor: AuditActor) {
    const updated = await this.prisma.company.update({ where: { id: companyId }, data: { onboardingCompletedAt: new Date() } });
    this.audit.record(companyId, actor, "company.onboarding_completed", "Company", companyId, "Completed onboarding setup");
    return updated;
  }
}
