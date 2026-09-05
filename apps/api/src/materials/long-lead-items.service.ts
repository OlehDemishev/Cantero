import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateLongLeadItemInput, UpdateLongLeadItemInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { calculateLongLeadRisk } from "./long-lead-risk";

@Injectable()
export class LongLeadItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every tracked long-lead item for a project, annotated with its current schedule risk — see long-lead-risk.ts. */
  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    const items = await this.prisma.longLeadItem.findMany({
      where: { companyId, projectId },
      include: { supplier: true, purchaseOrder: { select: { id: true, status: true } } },
      orderBy: { createdAt: "desc" },
    });
    const risk = calculateLongLeadRisk(items);
    return items.map((item, i) => ({ ...item, risk: risk[i].risk, slackDays: risk[i].slackDays }));
  }

  async create(companyId: string, actor: AuditActor, input: CreateLongLeadItemInput) {
    const project = await this.assertProject(companyId, input.projectId);
    if (input.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: input.supplierId, companyId } });
      if (!supplier) throw new NotFoundException("Supplier not found");
    }

    const item = await this.prisma.longLeadItem.create({
      data: {
        companyId,
        projectId: input.projectId,
        description: input.description,
        supplierId: input.supplierId,
        requiredOnSiteDate: input.requiredOnSiteDate ? new Date(input.requiredOnSiteDate) : undefined,
        expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : undefined,
        notes: input.notes,
        createdByUserId: actor.userId,
        createdByName: actor.name,
      },
    });
    this.audit.record(companyId, actor, "long_lead_item.created", "LongLeadItem", item.id, `Started tracking long-lead item "${input.description}" on "${project.name}"`);
    return item;
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdateLongLeadItemInput) {
    const item = await this.findOrThrow(companyId, id);
    if (input.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: input.supplierId, companyId } });
      if (!supplier) throw new NotFoundException("Supplier not found");
    }
    if (input.purchaseOrderId) {
      const po = await this.prisma.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, companyId } });
      if (!po) throw new NotFoundException("Purchase order not found");
    }

    const updated = await this.prisma.longLeadItem.update({
      where: { id: item.id },
      data: {
        description: input.description,
        supplierId: input.supplierId,
        status: input.status,
        purchaseOrderId: input.purchaseOrderId,
        submittalApprovalDate: dateOrClear(input.submittalApprovalDate),
        orderedDate: dateOrClear(input.orderedDate),
        expectedDeliveryDate: dateOrClear(input.expectedDeliveryDate),
        actualDeliveryDate: dateOrClear(input.actualDeliveryDate),
        requiredOnSiteDate: dateOrClear(input.requiredOnSiteDate),
        notes: input.notes,
      },
    });
    this.audit.record(companyId, actor, "long_lead_item.updated", "LongLeadItem", item.id, `Updated long-lead item "${item.description}"${input.status ? ` — status: ${input.status}` : ""}`);
    return updated;
  }

  private async findOrThrow(companyId: string, id: string) {
    const item = await this.prisma.longLeadItem.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException("Long-lead item not found");
    return item;
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}

function dateOrClear(value: string | null | undefined): Date | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return new Date(value);
}
