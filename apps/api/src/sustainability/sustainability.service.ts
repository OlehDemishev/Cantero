import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateGreenCertificationInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

interface CarbonMaterialRow {
  materialCatalogItemId: string;
  code: string;
  name: string;
  quantity: number;
  unit: string;
  kgCo2e: number | null;
  greenCertified: boolean;
}

@Injectable()
export class SustainabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listCertifications(companyId: string, projectId: string) {
    return this.prisma.projectGreenCertification.findMany({
      where: { companyId, projectId },
      orderBy: { createdAt: "desc" },
    });
  }

  async addCertification(companyId: string, actor: AuditActor, input: CreateGreenCertificationInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const cert = await this.prisma.projectGreenCertification.create({
      data: {
        companyId,
        projectId: input.projectId,
        type: input.type,
        name: input.name,
        issuedAt: input.issuedAt ? new Date(input.issuedAt) : undefined,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        notes: input.notes,
      },
    });
    this.audit.record(
      companyId,
      actor,
      "green_certification.added",
      "ProjectGreenCertification",
      cert.id,
      `Added ${input.type.replace(/_/g, " ")} certification "${input.name}" to "${project.name}"`,
    );
    return cert;
  }

  async deleteCertification(companyId: string, id: string) {
    const cert = await this.prisma.projectGreenCertification.findFirst({ where: { id, companyId } });
    if (!cert) throw new NotFoundException("Certification not found");
    await this.prisma.projectGreenCertification.delete({ where: { id } });
  }

  /**
   * Embodied carbon from materials issued/written off to a project, in kg CO2e — computed only
   * from `StockMovement`s whose material has a `carbonFootprintKgCo2e` on file; materials with no
   * footprint entered are still listed (so the gap is visible) but excluded from the total rather
   * than silently treated as zero.
   */
  async carbonReport(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const movements = await this.prisma.stockMovement.findMany({
      where: { companyId, projectId, type: { in: ["issue", "write_off"] } },
      include: { materialCatalogItem: true },
    });

    return this.buildCarbonReport(movements);
  }

  /** Same computation as carbonReport(), but company-wide across every project. */
  async carbonSummary(companyId: string) {
    const movements = await this.prisma.stockMovement.findMany({
      where: { companyId, type: { in: ["issue", "write_off"] }, projectId: { not: null } },
      include: { materialCatalogItem: true },
    });
    return this.buildCarbonReport(movements);
  }

  private buildCarbonReport(
    movements: { quantity: unknown; materialCatalogItem: { id: string; code: string; name: string; unit: string; carbonFootprintKgCo2e: unknown; greenCertified: boolean; defaultUnitPrice: unknown } }[],
  ) {
    const byMaterial = new Map<string, CarbonMaterialRow>();
    let totalCost = 0;
    let greenCertifiedCost = 0;

    for (const m of movements) {
      const item = m.materialCatalogItem;
      const quantity = Number(m.quantity);
      const cost = quantity * Number(item.defaultUnitPrice);
      totalCost += cost;
      if (item.greenCertified) greenCertifiedCost += cost;

      const existing = byMaterial.get(item.id);
      const footprintPerUnit = item.carbonFootprintKgCo2e !== null ? Number(item.carbonFootprintKgCo2e) : null;
      const kgCo2e = footprintPerUnit !== null ? quantity * footprintPerUnit : null;

      if (existing) {
        existing.quantity += quantity;
        existing.kgCo2e = existing.kgCo2e !== null && kgCo2e !== null ? existing.kgCo2e + kgCo2e : null;
      } else {
        byMaterial.set(item.id, {
          materialCatalogItemId: item.id,
          code: item.code,
          name: item.name,
          quantity,
          unit: item.unit,
          kgCo2e,
          greenCertified: item.greenCertified,
        });
      }
    }

    const rows = Array.from(byMaterial.values())
      .map((r) => ({ ...r, quantity: round2(r.quantity), kgCo2e: r.kgCo2e !== null ? round2(r.kgCo2e) : null }))
      .sort((a, b) => (b.kgCo2e ?? 0) - (a.kgCo2e ?? 0));

    const totalKgCo2e = round2(rows.reduce((sum, r) => sum + (r.kgCo2e ?? 0), 0));
    const untrackedMaterialCount = rows.filter((r) => r.kgCo2e === null).length;
    const greenCertifiedPercent = totalCost > 0 ? round2((greenCertifiedCost / totalCost) * 100) : 0;

    return { rows, totalKgCo2e, untrackedMaterialCount, greenCertifiedPercent };
  }
}
