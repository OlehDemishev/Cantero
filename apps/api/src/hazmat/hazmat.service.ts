import { Injectable, NotFoundException } from "@nestjs/common";
import type { AddHazmatInventoryItemInput, AddSdsVersionInput, CreateHazardousMaterialInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { addMonthsUtc } from "../common/date-utils";

const DEFAULT_REVIEW_CYCLE_MONTHS = 36;

@Injectable()
export class HazmatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listMaterials(companyId: string) {
    return this.prisma.hazardousMaterial.findMany({
      where: { companyId },
      include: {
        sdsSheets: { orderBy: { createdAt: "desc" }, take: 1 },
        projectInventory: { include: { project: { select: { id: true, name: true } } } },
      },
      orderBy: { name: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const material = await this.findMaterialOrThrow(companyId, id);
    const sdsSheets = await this.prisma.safetyDataSheet.findMany({
      where: { hazardousMaterialId: id },
      include: { attachments: true },
      orderBy: { createdAt: "desc" },
    });
    return { ...material, sdsSheets };
  }

  async createMaterial(companyId: string, actor: AuditActor, input: CreateHazardousMaterialInput) {
    const material = await this.prisma.hazardousMaterial.create({
      data: { companyId, name: input.name, manufacturer: input.manufacturer, casNumber: input.casNumber },
    });
    this.audit.record(companyId, actor, "hazardous_material.created", "HazardousMaterial", material.id, `Added hazardous material "${input.name}"`);
    return material;
  }

  async addSdsVersion(companyId: string, actor: AuditActor, materialId: string, input: AddSdsVersionInput) {
    const material = await this.findMaterialOrThrow(companyId, materialId);
    const sds = await this.prisma.safetyDataSheet.create({
      data: {
        companyId,
        hazardousMaterialId: materialId,
        version: input.version,
        revisionDate: input.revisionDate ? new Date(input.revisionDate) : undefined,
        hazardClassification: input.hazardClassification,
      },
    });
    this.audit.record(companyId, actor, "safety_data_sheet.added", "SafetyDataSheet", sds.id, `Added SDS version for "${material.name}"`);
    return sds;
  }

  listForProject(companyId: string, projectId: string) {
    return this.prisma.projectHazmatInventory.findMany({
      where: { companyId, projectId },
      include: { hazardousMaterial: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async addToProjectInventory(companyId: string, actor: AuditActor, projectId: string, input: AddHazmatInventoryItemInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    const material = await this.findMaterialOrThrow(companyId, input.hazardousMaterialId);

    const item = await this.prisma.projectHazmatInventory.create({
      data: { companyId, projectId, hazardousMaterialId: input.hazardousMaterialId, quantity: input.quantity, location: input.location },
    });
    this.audit.record(companyId, actor, "project_hazmat_inventory.added", "ProjectHazmatInventory", item.id, `Added "${material.name}" to hazmat inventory for "${project.name}"`);
    return item;
  }

  async removeFromProjectInventory(companyId: string, actor: AuditActor, id: string) {
    const item = await this.prisma.projectHazmatInventory.findFirst({ where: { id, companyId }, include: { hazardousMaterial: true } });
    if (!item) throw new NotFoundException("Inventory item not found");
    await this.prisma.projectHazmatInventory.delete({ where: { id } });
    this.audit.record(companyId, actor, "project_hazmat_inventory.removed", "ProjectHazmatInventory", id, `Removed "${item.hazardousMaterial.name}" from hazmat inventory`);
    return { ok: true };
  }

  /** Materials whose latest SDS is missing a revisionDate, or whose revisionDate is older than
   * the review cycle — the "go get a fresh copy from the manufacturer" list. */
  async staleSdsReport(companyId: string, reviewCycleMonths = DEFAULT_REVIEW_CYCLE_MONTHS) {
    const cutoff = addMonthsUtc(new Date(), -reviewCycleMonths);

    const materials = await this.prisma.hazardousMaterial.findMany({
      where: { companyId },
      include: { sdsSheets: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    return materials
      .filter((m) => {
        const latest = m.sdsSheets[0];
        return !latest || !latest.revisionDate || latest.revisionDate < cutoff;
      })
      .map((m) => ({ id: m.id, name: m.name, manufacturer: m.manufacturer, latestRevisionDate: m.sdsSheets[0]?.revisionDate ?? null }));
  }

  private async findMaterialOrThrow(companyId: string, id: string) {
    const material = await this.prisma.hazardousMaterial.findFirst({ where: { id, companyId } });
    if (!material) throw new NotFoundException("Hazardous material not found");
    return material;
  }
}
