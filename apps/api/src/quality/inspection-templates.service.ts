import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateInspectionTemplateInput, UpdateInspectionTemplateInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class InspectionTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.inspectionTemplate.findMany({
      where: { companyId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const template = await this.prisma.inspectionTemplate.findFirst({
      where: { id, companyId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) throw new NotFoundException("Inspection template not found");
    return template;
  }

  async create(companyId: string, actor: AuditActor, input: CreateInspectionTemplateInput) {
    const template = await this.prisma.inspectionTemplate.create({
      data: {
        companyId,
        name: input.name,
        trade: input.trade,
        items: { create: input.items.map((item, i) => ({ description: item.description, sortOrder: i })) },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    this.audit.record(
      companyId,
      actor,
      "inspection_template.created",
      "InspectionTemplate",
      template.id,
      `Created inspection template "${template.name}"`,
    );
    return template;
  }

  async update(companyId: string, id: string, input: UpdateInspectionTemplateInput) {
    const template = await this.get(companyId, id);
    if (input.items) {
      await this.prisma.inspectionTemplateItem.deleteMany({ where: { inspectionTemplateId: template.id } });
    }
    return this.prisma.inspectionTemplate.update({
      where: { id: template.id },
      data: {
        name: input.name,
        trade: input.trade,
        items: input.items ? { create: input.items.map((item, i) => ({ description: item.description, sortOrder: i })) } : undefined,
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    await this.prisma.inspectionTemplate.delete({ where: { id } });
    return { ok: true };
  }
}
