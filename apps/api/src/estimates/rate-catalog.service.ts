import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateRateCatalogItemInput, EvaluateFormulaInput, ImportResult, UpdateRateCatalogItemInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { parseCsvRecords } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { metricMaterials, metricRateItems, imperialMaterials, imperialRateItems } from "./starter-catalog-data";
import { FormulaError, assertValidParamName, evaluateFormula } from "./formula";

@Injectable()
export class RateCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string, catalogId?: string) {
    return this.prisma.rateCatalogItem.findMany({
      where: { companyId, ...(catalogId ? { catalogId } : {}) },
      include: { materials: { include: { materialCatalogItem: true } } },
      orderBy: { code: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const item = await this.prisma.rateCatalogItem.findFirst({
      where: { id, companyId },
      include: { materials: { include: { materialCatalogItem: true } } },
    });
    if (!item) throw new NotFoundException("Rate catalog item not found");
    return item;
  }

  async create(companyId: string, input: CreateRateCatalogItemInput) {
    if (input.materials.length > 0) {
      const materialIds = [...new Set(input.materials.map((m) => m.materialCatalogItemId))];
      const owned = await this.prisma.materialCatalogItem.count({ where: { id: { in: materialIds }, companyId } });
      if (owned !== materialIds.length) throw new BadRequestException("One or more materials do not belong to this company");
    }
    if (input.catalogId) await this.assertCatalogOwned(companyId, input.catalogId);
    if (input.formula) this.validateFormula(input.formula, input.formulaParams);

    return this.prisma.rateCatalogItem.create({
      data: {
        companyId,
        catalogId: input.catalogId,
        code: input.code,
        name: input.name,
        unit: input.unit,
        laborHoursPerUnit: input.laborHoursPerUnit,
        formula: input.formula,
        formulaParams: input.formulaParams,
        materials: {
          create: input.materials.map((m) => ({
            materialCatalogItemId: m.materialCatalogItemId,
            quantityPerUnit: m.quantityPerUnit,
            wasteFactorPercent: m.wasteFactorPercent,
          })),
        },
      },
      include: { materials: true },
    });
  }

  /** Every edit snapshots the item's prior state into RateCatalogItemRevision first — there was
   * no update() at all before this phase (items could only be created), so this both adds the
   * missing edit capability and makes every edit auditable via history(). */
  async update(companyId: string, actor: AuditActor, id: string, input: UpdateRateCatalogItemInput) {
    const item = await this.get(companyId, id);
    if (input.catalogId) await this.assertCatalogOwned(companyId, input.catalogId);
    const formula = input.formula === undefined ? item.formula : input.formula;
    const formulaParams = input.formulaParams ?? item.formulaParams;
    if (formula) this.validateFormula(formula, formulaParams);

    await this.prisma.rateCatalogItemRevision.create({
      data: {
        rateCatalogItemId: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        laborHoursPerUnit: item.laborHoursPerUnit,
        changedByUserId: actor.userId,
        changedByName: actor.name,
      },
    });

    return this.prisma.rateCatalogItem.update({
      where: { id: item.id },
      data: {
        name: input.name,
        unit: input.unit,
        laborHoursPerUnit: input.laborHoursPerUnit,
        catalogId: input.catalogId,
        formula: input.formula,
        formulaParams: input.formulaParams,
      },
      include: { materials: { include: { materialCatalogItem: true } } },
    });
  }

  history(companyId: string, id: string) {
    return this.prisma.rateCatalogItemRevision.findMany({
      where: { rateCatalogItem: { id, companyId } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Evaluates a rate item's formula against caller-supplied parameter values — used to derive
   * an estimate line's quantity before it's submitted through the ordinary add-line endpoint. */
  evaluateFormula(companyId: string, id: string, input: EvaluateFormulaInput) {
    return this.get(companyId, id).then((item) => {
      if (!item.formula) throw new BadRequestException("This rate item has no formula");
      const missing = item.formulaParams.filter((p) => !(p in input.variables));
      if (missing.length > 0) throw new BadRequestException(`Missing values for: ${missing.join(", ")}`);
      try {
        return { value: evaluateFormula(item.formula, input.variables) };
      } catch (err) {
        if (err instanceof FormulaError) throw new BadRequestException(err.message);
        throw err;
      }
    });
  }

  private validateFormula(formula: string, formulaParams: string[]): void {
    formulaParams.forEach(assertValidParamName);
    try {
      const dummyVars = Object.fromEntries(formulaParams.map((p) => [p, 1]));
      evaluateFormula(formula, dummyVars);
    } catch (err) {
      if (err instanceof FormulaError) throw new BadRequestException(`Invalid formula: ${err.message}`);
      throw err;
    }
  }

  private async assertCatalogOwned(companyId: string, catalogId: string): Promise<void> {
    const catalog = await this.prisma.catalog.findFirst({ where: { id: catalogId, companyId } });
    if (!catalog) throw new NotFoundException("Catalog not found");
  }

  /** Loads the built-in starter catalog (metric or imperial, matching the company's unit system). No-op if the company already has any rate catalog items. */
  async seedStarter(companyId: string, actor: AuditActor) {
    const existingCount = await this.prisma.rateCatalogItem.count({ where: { companyId } });
    if (existingCount > 0) throw new BadRequestException("Rate catalog is not empty");

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const materials = company.unitSystem === "imperial" ? imperialMaterials : metricMaterials;
    const rateItems = company.unitSystem === "imperial" ? imperialRateItems : metricRateItems;

    const materialIdByCode = new Map<string, string>();
    for (const m of materials) {
      const created = await this.prisma.materialCatalogItem.create({
        data: { companyId, code: m.code, name: m.name, unit: m.unit, defaultUnitPrice: m.defaultUnitPrice },
      });
      materialIdByCode.set(m.code, created.id);
    }

    for (const ri of rateItems) {
      await this.prisma.rateCatalogItem.create({
        data: {
          companyId,
          code: ri.code,
          name: ri.name,
          unit: ri.unit,
          laborHoursPerUnit: ri.laborHoursPerUnit,
          materials: {
            create: ri.materials.map((m) => ({
              materialCatalogItemId: materialIdByCode.get(m.materialCode)!,
              quantityPerUnit: m.quantityPerUnit,
              wasteFactorPercent: m.wasteFactorPercent ?? 0,
            })),
          },
        },
      });
    }

    this.audit.record(
      companyId,
      actor,
      "rate_catalog.starter_seeded",
      "Company",
      companyId,
      `Loaded starter catalog: ${materials.length} materials, ${rateItems.length} rate items`,
    );

    return { materialsCreated: materials.length, rateItemsCreated: rateItems.length };
  }

  /** CSV columns: code (required), name (required), unit (required), laborHoursPerUnit (required, numeric). No material norms — those still need setting up via the item detail view. Rows whose code already exists for this company are skipped. */
  async importCsv(companyId: string, actor: AuditActor, csv: string): Promise<ImportResult> {
    const records = parseCsvRecords(csv);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    const existing = await this.prisma.rateCatalogItem.findMany({ where: { companyId }, select: { code: true } });
    const seenCodes = new Set(existing.map((r) => r.code));

    const toCreate: { code: string; name: string; unit: string; laborHoursPerUnit: number }[] = [];

    records.forEach((record, index) => {
      const row = index + 2;
      const code = record.code?.trim();
      const name = record.name?.trim();
      const unit = record.unit?.trim();
      const hoursRaw = record.laborhoursperunit?.trim();
      const laborHoursPerUnit = Number(hoursRaw);

      if (!code || !name || !unit || !hoursRaw || Number.isNaN(laborHoursPerUnit)) {
        result.skipped++;
        result.errors.push({ row, message: "Missing or invalid code/name/unit/laborHoursPerUnit" });
        return;
      }
      if (seenCodes.has(code)) {
        result.skipped++;
        result.errors.push({ row, message: `Code "${code}" already exists` });
        return;
      }
      seenCodes.add(code);
      toCreate.push({ code, name, unit, laborHoursPerUnit });
    });

    if (toCreate.length > 0) {
      await this.prisma.rateCatalogItem.createMany({ data: toCreate.map((r) => ({ ...r, companyId })) });
      result.created = toCreate.length;
    }

    this.audit.record(
      companyId,
      actor,
      "rate_catalog.imported",
      "Company",
      companyId,
      `Imported ${result.created} rate catalog items from CSV (${result.skipped} skipped)`,
    );

    return result;
  }
}
