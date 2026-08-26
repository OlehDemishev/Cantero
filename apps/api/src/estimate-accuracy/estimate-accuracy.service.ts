import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const roundPercent = (n: number): number => Math.round(n * 10) / 10;

const MIN_SAMPLE_SIZE = 2;

export interface RateItemAccuracy {
  rateCatalogItemId: string;
  code: string;
  name: string;
  unit: string;
  laborSampleSize: number;
  estimatedLaborHours: number;
  actualLaborHours: number;
  laborDeviationPercent: number | null;
  materialSampleSize: number;
  estimatedMaterialsCost: number;
  actualMaterialsCost: number;
  materialsDeviationPercent: number | null;
}

@Injectable()
export class EstimateAccuracyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "This rate item typically runs N% over/under estimate" — a comparison against the company's
   * own recorded history only (TimeEntry hours, StockMovement quantities), no external AI/LLM.
   * Only estimate lines with actual data linked count toward each sample (labor via
   * Task.estimateLineId, materials via StockMovement.estimateLineId) — a line nobody ever logged
   * time or issued stock against would otherwise read as a false 100% underrun.
   */
  async rateItemAccuracy(companyId: string): Promise<RateItemAccuracy[]> {
    const items = await this.prisma.rateCatalogItem.findMany({
      where: { companyId },
      include: {
        materials: { include: { materialCatalogItem: true } },
        estimateLines: {
          where: { estimate: { companyId, status: "approved" } },
          select: {
            quantity: true,
            tasks: { select: { timeEntries: { select: { hours: true } } } },
            stockMovements: {
              where: { type: { in: ["issue", "write_off"] } },
              select: { quantity: true, materialCatalogItemId: true },
            },
          },
        },
      },
      orderBy: { code: "asc" },
    });

    const results = items.map((item): RateItemAccuracy => {
      const priceByMaterialId = new Map(
        item.materials.map((m) => [m.materialCatalogItemId, Number(m.materialCatalogItem.defaultUnitPrice)]),
      );

      let estimatedLaborHours = 0;
      let actualLaborHours = 0;
      let laborSampleSize = 0;
      let estimatedMaterialsCost = 0;
      let actualMaterialsCost = 0;
      let materialSampleSize = 0;

      for (const line of item.estimateLines) {
        const lineActualHours = line.tasks.reduce(
          (sum, task) => sum + task.timeEntries.reduce((s, entry) => s + Number(entry.hours), 0),
          0,
        );
        if (lineActualHours > 0) {
          laborSampleSize += 1;
          estimatedLaborHours += Number(line.quantity) * Number(item.laborHoursPerUnit);
          actualLaborHours += lineActualHours;
        }

        if (line.stockMovements.length > 0) {
          materialSampleSize += 1;
          actualMaterialsCost += line.stockMovements.reduce(
            (sum, m) => sum + Number(m.quantity) * (priceByMaterialId.get(m.materialCatalogItemId) ?? 0),
            0,
          );
          estimatedMaterialsCost += item.materials.reduce((sum, norm) => {
            const wasteMultiplier = 1 + Number(norm.wasteFactorPercent) / 100;
            const price = priceByMaterialId.get(norm.materialCatalogItemId) ?? 0;
            return sum + Number(norm.quantityPerUnit) * wasteMultiplier * Number(line.quantity) * price;
          }, 0);
        }
      }

      return {
        rateCatalogItemId: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        laborSampleSize,
        estimatedLaborHours: round2(estimatedLaborHours),
        actualLaborHours: round2(actualLaborHours),
        laborDeviationPercent:
          laborSampleSize >= MIN_SAMPLE_SIZE && estimatedLaborHours > 0
            ? roundPercent(((actualLaborHours - estimatedLaborHours) / estimatedLaborHours) * 100)
            : null,
        materialSampleSize,
        estimatedMaterialsCost: round2(estimatedMaterialsCost),
        actualMaterialsCost: round2(actualMaterialsCost),
        materialsDeviationPercent:
          materialSampleSize >= MIN_SAMPLE_SIZE && estimatedMaterialsCost > 0
            ? roundPercent(((actualMaterialsCost - estimatedMaterialsCost) / estimatedMaterialsCost) * 100)
            : null,
      };
    });

    return results.filter((r) => r.laborSampleSize > 0 || r.materialSampleSize > 0);
  }
}
