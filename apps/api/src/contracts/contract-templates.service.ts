import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateContractTemplateInput, UpdateContractTemplateInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class ContractTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.contractTemplate.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  async get(companyId: string, id: string) {
    const template = await this.prisma.contractTemplate.findFirst({ where: { id, companyId } });
    if (!template) throw new NotFoundException("Contract template not found");
    return template;
  }

  async create(companyId: string, actor: AuditActor, input: CreateContractTemplateInput) {
    const template = await this.prisma.contractTemplate.create({ data: { companyId, name: input.name, body: input.body } });
    this.audit.record(companyId, actor, "contract_template.created", "ContractTemplate", template.id, `Created contract template "${template.name}"`);
    return template;
  }

  async update(companyId: string, id: string, input: UpdateContractTemplateInput) {
    await this.get(companyId, id);
    return this.prisma.contractTemplate.update({ where: { id }, data: input });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    await this.prisma.contractTemplate.delete({ where: { id } });
    return { ok: true };
  }
}
