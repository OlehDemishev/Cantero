import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { CSI_MASTERFORMAT_DIVISIONS, type Currency } from "@cantero/shared";
import {
  metricMaterials,
  metricRateItems,
  imperialMaterials,
  imperialRateItems,
  type StarterMaterial,
  type StarterRateItem,
} from "../src/estimates/starter-catalog-data";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "cantero-demo-2026";

/** Single source of truth is CSI_MASTERFORMAT_DIVISIONS in @cantero/shared — also what
 * CostCodesService.importStandardLibrary offers a real company, so a demo company and one that
 * imports the standard library later end up with the exact same starter set. */
const STARTER_COST_CODES = CSI_MASTERFORMAT_DIVISIONS;

async function main() {
  const plans = await Promise.all(
    [
      { code: "starter", name: "Starter", pricePerSeat: 49, seatMinimum: 1 },
      { code: "growth", name: "Growth", pricePerSeat: 79, seatMinimum: 3 },
      { code: "pro", name: "Pro", pricePerSeat: 119, seatMinimum: 5 },
    ].map((plan) =>
      prisma.plan.upsert({
        where: { code: plan.code },
        update: {},
        create: plan,
      }),
    ),
  );
  const growthPlan = plans.find((p) => p.code === "growth")!;
  console.log(`Seeded ${plans.length} plans`);

  await seedExchangeRates();

  await seedCompany({
    companyName: "Cantero Demo GmbH",
    ownerEmail: "demo-eu@cantero.dev",
    ownerName: "Anke Müller",
    country: "DE",
    unitSystem: "metric",
    currency: "EUR",
    locale: "de",
    planId: growthPlan.id,
    materials: metricMaterials,
    rateItems: metricRateItems,
  });

  await seedCompany({
    companyName: "Cantero Demo Inc",
    ownerEmail: "demo-us@cantero.dev",
    ownerName: "Jordan Reyes",
    country: "US",
    unitSystem: "imperial",
    currency: "USD",
    locale: "en",
    planId: growthPlan.id,
    materials: imperialMaterials,
    rateItems: imperialRateItems,
  });

  const ua = await seedCompany({
    companyName: "ТОВ «Карпати Буд»",
    ownerEmail: "demo-ua@cantero.dev",
    ownerName: "Олена Ковальчук",
    country: "UA",
    unitSystem: "metric",
    currency: "EUR",
    locale: "uk",
    planId: growthPlan.id,
    materials: metricMaterials,
    rateItems: metricRateItems,
  });
  if (ua) await seedUkrainianShowcase(ua);

  console.log("\nDemo logins (password for all): " + DEMO_PASSWORD);
  console.log("  EU (metric/EUR/de): demo-eu@cantero.dev");
  console.log("  US (imperial/USD/en): demo-us@cantero.dev");
  console.log("  UA (metric/EUR/uk, full showcase data): demo-ua@cantero.dev");
}

/** Plausible, hand-picked cross rates (not live) — see ExchangeRateService for why there's no
 * live feed. USD_PER expresses each currency's value in USD; every directed pair is derived from
 * that single table so the rates are internally consistent (EUR->USD and USD->EUR truly invert). */
async function seedExchangeRates() {
  const USD_PER: Record<string, number> = { EUR: 1.08, USD: 1.0, GBP: 1.25, CHF: 1.15, CAD: 0.74, PLN: 0.25, UAH: 0.024 };
  const currencies = Object.keys(USD_PER);

  const rows: { fromCurrency: string; toCurrency: string; rate: number }[] = [];
  for (const from of currencies) {
    for (const to of currencies) {
      if (from === to) continue;
      rows.push({ fromCurrency: from, toCurrency: to, rate: USD_PER[from] / USD_PER[to] });
    }
  }

  await Promise.all(
    rows.map((r) =>
      prisma.exchangeRate.upsert({
        where: { fromCurrency_toCurrency: { fromCurrency: r.fromCurrency as never, toCurrency: r.toCurrency as never } },
        update: { rate: r.rate },
        create: { fromCurrency: r.fromCurrency as never, toCurrency: r.toCurrency as never, rate: r.rate },
      }),
    ),
  );
  console.log(`Seeded ${rows.length} exchange rate pairs`);
}

interface SeedCompanyResult {
  companyId: string;
  ownerUserId: string;
  ownerName: string;
  materialIdByCode: Map<string, string>;
  rateItemIdByCode: Map<string, string>;
  costCodeIdByCode: Map<string, string>;
  clientId: string;
  projectId: string;
}

async function seedCompany(args: {
  companyName: string;
  ownerEmail: string;
  ownerName: string;
  country: string;
  unitSystem: "metric" | "imperial";
  currency: Currency;
  locale: "en" | "de" | "es" | "pl" | "uk";
  planId: string;
  materials: StarterMaterial[];
  rateItems: StarterRateItem[];
}): Promise<SeedCompanyResult | null> {
  const existing = await prisma.user.findUnique({ where: { email: args.ownerEmail } });
  if (existing) {
    console.log(`Skipping ${args.companyName} — ${args.ownerEmail} already exists`);
    return null;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const company = await prisma.company.create({
    data: {
      name: args.companyName,
      country: args.country,
      unitSystem: args.unitSystem,
      currency: args.currency,
      locale: args.locale,
    },
  });

  const user = await prisma.user.create({
    data: { email: args.ownerEmail, passwordHash, name: args.ownerName },
  });

  await prisma.membership.create({
    data: { userId: user.id, companyId: company.id, role: "owner" },
  });

  // Seeded as `active` directly — lets the Phase 1 demo work without a real Stripe checkout.
  // In production this row is only ever created `incomplete` and flipped by the Stripe webhook.
  await prisma.subscription.create({
    data: { companyId: company.id, planId: args.planId, status: "active", seats: 3 },
  });

  // Resolve/create one UnitOfMeasure per distinct unit string across this company's seed
  // materials — same "kg" shouldn't become two unrelated rows just because two materials use it.
  const unitIdByCode = new Map<string, string>();
  const materialIdByCode = new Map<string, string>();
  for (const m of args.materials) {
    let unitId = unitIdByCode.get(m.unit.toLowerCase());
    if (!unitId) {
      const unit = await prisma.unitOfMeasure.upsert({
        where: { companyId_code: { companyId: company.id, code: m.unit } },
        create: { companyId: company.id, code: m.unit, name: m.unit },
        update: {},
      });
      unitId = unit.id;
      unitIdByCode.set(m.unit.toLowerCase(), unitId);
    }

    const created = await prisma.materialCatalogItem.create({
      data: { companyId: company.id, code: m.code, name: m.name, unit: m.unit, unitId, defaultUnitPrice: m.defaultUnitPrice },
    });
    materialIdByCode.set(m.code, created.id);
  }

  const rateItemIdByCode = new Map<string, string>();
  for (const ri of args.rateItems) {
    const created = await prisma.rateCatalogItem.create({
      data: {
        companyId: company.id,
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
    rateItemIdByCode.set(ri.code, created.id);
  }

  const costCodeIdByCode = new Map<string, string>();
  for (const c of STARTER_COST_CODES) {
    const created = await prisma.costCode.create({ data: { companyId: company.id, code: c.code, name: c.name } });
    costCodeIdByCode.set(c.code, created.id);
  }

  const client = await prisma.client.create({
    data: { companyId: company.id, name: "Nordwind Bau AG", email: "contact@example.com" },
  });

  const project = await prisma.project.create({
    data: { companyId: company.id, name: "Sample Renovation Project", clientId: client.id },
  });

  console.log(
    `Seeded ${args.companyName}: ${args.materials.length} materials, ${args.rateItems.length} rate items, 1 client, 1 project`,
  );

  return {
    companyId: company.id,
    ownerUserId: user.id,
    ownerName: args.ownerName,
    materialIdByCode,
    rateItemIdByCode,
    costCodeIdByCode,
    clientId: client.id,
    projectId: project.id,
  };
}

/** A much richer dataset than seedCompany()'s bare client+project — one populated example in
 * every major module, entirely in Ukrainian, so the demo tells a believable story end to end
 * rather than showing empty states everywhere outside the estimate/invoice happy path. Builds on
 * top of the base company/catalog/client/project seedCompany() already created for this company. */
async function seedUkrainianShowcase(base: SeedCompanyResult) {
  const { companyId, ownerUserId, ownerName } = base;
  const now = new Date();
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  // ---------- Additional clients (base.clientId from seedCompany is left in place, unused further here) ----------
  const clientHotel = await prisma.client.create({
    data: {
      companyId,
      name: "Готель «Карпатський Затишок»",
      email: "management@karpaty-hotel.example",
      phone: "+380 34 222 1010",
      stage: "won",
      wonAt: daysFromNow(-60),
      estimatedValue: 185000,
    },
  });
  const clientResidential = await prisma.client.create({
    data: {
      companyId,
      name: "ЖК «Дніпровський» — забудовник",
      email: "office@dnipro-residence.example",
      phone: "+380 56 233 4477",
      stage: "won",
      wonAt: daysFromNow(-120),
      estimatedValue: 420000,
    },
  });
  const clientAgro = await prisma.client.create({
    data: {
      companyId,
      name: "ПрАТ «Агро-Захід»",
      email: "info@agro-zahid.example",
      phone: "+380 32 240 5566",
      stage: "qualified",
      estimatedValue: 95000,
      probability: 60,
      expectedCloseDate: daysFromNow(30),
    },
  });
  await prisma.client.create({
    data: {
      companyId,
      name: "«Дніпро Плаза» — бізнес-центр",
      email: "contact@dnipro-plaza.example",
      phone: "+380 56 111 2233",
      stage: "contacted",
      estimatedValue: 60000,
      probability: 25,
    },
  });
  console.log("  UA: 4 additional clients");

  // ---------- Workers ----------
  const workerForeman = await prisma.worker.create({
    data: {
      companyId,
      name: "Олег Мельник",
      role: "Виконроб",
      hourlyCost: 350,
      phone: "+380501234567",
      preferredLocale: "uk",
    },
  });
  const workerElectrician = await prisma.worker.create({
    data: { companyId, name: "Тарас Бондаренко", role: "Електрик", hourlyCost: 280, phone: "+380671234567", preferredLocale: "uk" },
  });
  const workerEstimator = await prisma.worker.create({
    data: { companyId, name: "Ірина Коваль", role: "Кошторисник", hourlyCost: 260 },
  });
  const workerCrane = await prisma.worker.create({
    data: { companyId, name: "Андрій Савчук", role: "Кранівник", hourlyCost: 300, phone: "+380631234567", preferredLocale: "uk" },
  });
  const workerOffice = await prisma.worker.create({
    data: { companyId, name: "Марія Гончар", role: "Офіс-менеджер", hourlyCost: 220 },
  });
  await prisma.workerCertification.create({
    data: { companyId, workerId: workerElectrician.id, name: "Електробезпека, IV група допуску", expiresAt: daysFromNow(45) },
  });
  await prisma.workerCertification.create({
    data: { companyId, workerId: workerCrane.id, name: "Посвідчення кранівника", expiresAt: daysFromNow(200) },
  });
  console.log("  UA: 5 workers, 2 certifications");

  // ---------- Projects ----------
  const projectHotel = await prisma.project.create({
    data: {
      companyId,
      name: "Реконструкція готелю «Карпатський Затишок»",
      address: "вул. Гірська 15, Яремче, Івано-Франківська обл.",
      clientId: clientHotel.id,
      isPublicWork: false,
    },
  });
  const projectResidential = await prisma.project.create({
    data: {
      companyId,
      name: "Житловий комплекс «Дніпровський», черга 2",
      address: "просп. Перемоги 102, Дніпро",
      clientId: clientResidential.id,
    },
  });
  await prisma.project.create({
    data: {
      companyId,
      name: "Складський комплекс «Агро-Захід»",
      address: "с. Брюховичі, Львівська обл.",
      clientId: clientAgro.id,
    },
  });
  console.log("  UA: 3 additional projects (flagship: готель)");

  // ---------- Estimate on the flagship project (concrete slab, roof insulation, floor tile) ----------
  const estimate = await prisma.estimate.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      name: "Кошторис на реконструкцію — черга 1",
      status: "approved",
      laborRatePerHour: 25,
      markupPercent: 15,
      taxPercent: 20,
      materialsCostTotal: 8962.75,
      laborCostTotal: 4652.5,
      subtotal: 13615.25,
      markupAmount: 2042.29,
      taxAmount: 3131.51,
      grandTotal: 18789.05,
    },
  });
  const sectionStructural = await prisma.estimateSection.create({
    data: { estimateId: estimate.id, name: "Конструктивні роботи", sortOrder: 0 },
  });
  const sectionFinishes = await prisma.estimateSection.create({
    data: { estimateId: estimate.id, name: "Оздоблювальні роботи", sortOrder: 1 },
  });
  await prisma.estimateLine.create({
    data: {
      estimateId: estimate.id,
      sectionId: sectionStructural.id,
      rateCatalogItemId: base.rateItemIdByCode.get("RC-CONCRETE-SLAB")!,
      quantity: 150,
      materialsCost: 3300,
      laborCost: 1687.5,
      lineTotal: 4987.5,
      sortOrder: 0,
      costCodeId: base.costCodeIdByCode.get("03 00 00"),
    },
  });
  await prisma.estimateLine.create({
    data: {
      estimateId: estimate.id,
      sectionId: sectionStructural.id,
      rateCatalogItemId: base.rateItemIdByCode.get("RC-ROOF-INSULATION")!,
      quantity: 280,
      materialsCost: 2618,
      laborCost: 1540,
      lineTotal: 4158,
      sortOrder: 1,
      costCodeId: base.costCodeIdByCode.get("07 00 00"),
    },
  });
  await prisma.estimateLine.create({
    data: {
      estimateId: estimate.id,
      sectionId: sectionFinishes.id,
      rateCatalogItemId: base.rateItemIdByCode.get("RC-TILE-FLOOR")!,
      quantity: 95,
      materialsCost: 3044.75,
      laborCost: 1425,
      lineTotal: 4469.75,
      sortOrder: 0,
      costCodeId: base.costCodeIdByCode.get("09 00 00"),
    },
  });
  console.log("  UA: 1 approved estimate, 2 sections, 3 lines");

  // ---------- Invoice ----------
  const invoice = await prisma.invoice.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      clientId: clientHotel.id,
      estimateId: estimate.id,
      number: "РАХ-2026-001",
      status: "sent",
      subtotal: 8200,
      taxAmount: 1640,
      total: 9840,
      dueDate: daysFromNow(14),
    },
  });
  await prisma.invoiceLine.create({
    data: { invoiceId: invoice.id, description: "Аванс за мобілізацію та підготовчі роботи", quantity: 1, unitPrice: 5000, lineTotal: 5000 },
  });
  await prisma.invoiceLine.create({
    data: { invoiceId: invoice.id, description: "Часткова оплата за демонтажні роботи", quantity: 1, unitPrice: 3200, lineTotal: 3200 },
  });
  console.log("  UA: 1 invoice, 2 lines");

  // ---------- Tasks, daily log, punch list, RFI ----------
  const taskDemo = await prisma.task.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      name: "Демонтажні роботи",
      status: "done",
      startDate: daysFromNow(-20),
      dueDate: daysFromNow(-10),
    },
  });
  await prisma.task.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      name: "Фундаментні та бетонні роботи",
      status: "in_progress",
      startDate: daysFromNow(-9),
      dueDate: daysFromNow(15),
    },
  });
  await prisma.task.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      name: "Покрівельні роботи",
      status: "planned",
      startDate: daysFromNow(16),
      dueDate: daysFromNow(35),
      isOutdoorWork: true,
    },
  });

  await prisma.dailyLog.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      date: new Date(new Date().setHours(0, 0, 0, 0)),
      authorUserId: ownerUserId,
      authorName: ownerName,
      weatherCondition: "clear",
      crewCount: 6,
      workPerformed: "Завершено демонтаж старої покрівлі, розпочато армування фундаментної плити на дільниці А.",
      notes: "Постачання арматури заплановане на завтра вранці.",
    },
  });

  await prisma.punchListItem.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      title: "Пошкоджена плитка у вестибюлі",
      description: "Тріщина на підлозі біля рецепції, потребує заміни 3 плиток.",
      location: "1-й поверх, вестибюль",
      status: "open",
      createdByUserId: ownerUserId,
      createdByName: ownerName,
    },
  });

  await prisma.rfi.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      number: "RFI-001",
      subject: "Уточнення типу утеплювача для покрівлі",
      question: "У проєкті вказана мінеральна вата 150мм — чи можна замінити на еквівалент з кращим коефіцієнтом теплопровідності?",
      priority: "medium",
      status: "open",
      askedByUserId: ownerUserId,
      askedByName: ownerName,
      dueDate: daysFromNow(7),
    },
  });
  console.log("  UA: 3 tasks, 1 daily log, 1 punch-list item, 1 RFI");

  // ---------- Safety: incident, briefing, JHA ----------
  await prisma.incidentReport.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      occurredAt: daysFromNow(-3),
      severity: "near_miss",
      description: "Незакріплена драбина під час робіт на висоті — вчасно помічено бригадиром, ніхто не постраждав.",
      location: "Дах, дільниця Б",
      correctiveActions: "Проведено позачерговий інструктаж, драбини перевірено та промарковано.",
      reportedByUserId: ownerUserId,
      reportedByName: ownerName,
    },
  });

  const briefing = await prisma.safetyBriefing.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      date: daysFromNow(-1),
      topic: "Техніка безпеки при роботі на висоті",
      notes: "Обов'язкове використання страхувальних поясів та касок на всіх ділянках вище 1.8м.",
      conductedByUserId: ownerUserId,
      conductedByName: ownerName,
    },
  });
  await prisma.safetyBriefingAttendance.createMany({
    data: [workerForeman, workerElectrician, workerCrane].map((w) => ({ briefingId: briefing.id, workerId: w.id })),
  });

  const jha = await prisma.jobHazardAnalysis.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      taskId: taskDemo.id,
      date: daysFromNow(-21),
      taskDescription: "Демонтаж старої покрівлі",
      hazards: "Падіння з висоти, падіння уламків матеріалу, гострі краї покрівельного заліза.",
      controlMeasures: "Огородження периметра, страхувальні пояси, сортування уламків у контейнер одразу після демонтажу.",
      requiredPpe: "Каска, страхувальний пояс, рукавиці, захисні окуляри",
      conductedByUserId: ownerUserId,
      conductedByName: ownerName,
    },
  });
  await prisma.jhaAcknowledgment.createMany({
    data: [workerForeman, workerElectrician].map((w) => ({ jhaId: jha.id, workerId: w.id })),
  });
  console.log("  UA: 1 safety incident, 1 toolbox talk (2 attendees), 1 JHA (2 acknowledgments)");

  // ---------- Permit & inspection ----------
  const permit = await prisma.permit.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      permitType: "Дозвіл на будівельні роботи",
      permitNumber: "ІФ-2026-0342",
      authorityName: "Івано-Франківська обласна ДІАМ",
      status: "submitted",
      submittedAt: daysFromNow(-30),
      expiresAt: daysFromNow(340),
    },
  });
  await prisma.inspection.create({
    data: {
      companyId,
      permitId: permit.id,
      inspectionType: "Проміжна перевірка фундаменту",
      scheduledDate: daysFromNow(12),
      inspectorName: "Петро Ткаченко",
      inspectorContact: "+380 34 222 9090",
      result: "pending",
    },
  });
  console.log("  UA: 1 permit, 1 inspection");

  // ---------- Submittal ----------
  await prisma.submittal.create({
    data: {
      companyId,
      projectId: projectHotel.id,
      number: "SUB-001",
      title: "Зразок покрівельного матеріалу — керамічна черепиця",
      specSection: "07 00 00",
      status: "submitted",
      dueDate: daysFromNow(5),
      submittedAt: daysFromNow(-2),
      submittedByUserId: ownerUserId,
      submittedByName: ownerName,
    },
  });
  console.log("  UA: 1 submittal");

  // ---------- Time entries ----------
  await prisma.timeEntry.createMany({
    data: [
      { companyId, workerId: workerForeman.id, projectId: projectHotel.id, taskId: taskDemo.id, hours: 8, date: daysFromNow(-15), hourlyCostSnapshot: 350 },
      { companyId, workerId: workerElectrician.id, projectId: projectHotel.id, taskId: taskDemo.id, hours: 7.5, date: daysFromNow(-15), hourlyCostSnapshot: 280 },
      { companyId, workerId: workerCrane.id, projectId: projectHotel.id, hours: 6, date: daysFromNow(-8), hourlyCostSnapshot: 300 },
    ],
  });
  console.log("  UA: 3 time entries");

  // ---------- Subcontractors ----------
  const subElectric = await prisma.subcontractor.create({
    data: {
      companyId,
      name: "«ЕлектроМонтаж Захід» ТОВ",
      email: "office@electromontazh-zahid.example",
      phone: "+380 32 245 1122",
      specialization: "Електромонтажні роботи",
      bio: "Понад 15 років на ринку, спеціалізація — комерційні та готельні об'єкти.",
      licenseNumber: "ЕМ-2019-4471",
      bondingCapacity: 50000,
      safetyProgramSummary: "Щотижневі інструктажі, повний комплект ЗІЗ для всіх працівників на об'єкті.",
    },
  });
  const subHvac = await prisma.subcontractor.create({
    data: {
      companyId,
      name: "«ТеплоБуд Сервіс»",
      email: "info@teplobud-service.example",
      phone: "+380 67 331 8899",
      specialization: "Опалення, вентиляція, сантехніка",
      licenseNumber: "ТБ-2021-1183",
    },
  });
  await prisma.subcontractor.create({
    data: { companyId, name: "«Дах і Фасад»", email: "contact@dah-fasad.example", phone: "+380 50 112 3344", specialization: "Покрівельні та фасадні роботи" },
  });

  await prisma.subcontractorDocument.createMany({
    data: [
      { companyId, subcontractorId: subElectric.id, type: "general_liability_insurance", name: "Поліс страхування відповідальності №GL-88231", expiresAt: daysFromNow(120) },
      { companyId, subcontractorId: subElectric.id, type: "workers_comp_insurance", name: "Страхування працівників №WC-55021", expiresAt: daysFromNow(90) },
      { companyId, subcontractorId: subHvac.id, type: "general_liability_insurance", name: "Поліс страхування відповідальності №GL-77410", expiresAt: daysFromNow(20) },
    ],
  });

  const subAssignment = await prisma.subcontractorAssignment.create({
    data: { subcontractorId: subElectric.id, projectId: projectHotel.id, startDate: daysFromNow(-15), endDate: daysFromNow(20) },
  });
  await prisma.subcontractorPerformanceReview.create({
    data: {
      companyId,
      subcontractorId: subElectric.id,
      assignmentId: subAssignment.id,
      reviewedByUserId: ownerUserId,
      reviewedByName: ownerName,
      rating: 5,
      onTime: true,
      wouldHireAgain: true,
      comments: "Якісна робота, дотримались графіка.",
    },
  });

  const subCost = await prisma.subcontractorCost.create({
    data: {
      companyId,
      subcontractorId: subElectric.id,
      projectId: projectHotel.id,
      description: "Електромонтажні роботи — черга 1",
      amount: 12000,
      incurredDate: daysFromNow(-10),
      paid: true,
      costCodeId: base.costCodeIdByCode.get("26 00 00"),
    },
  });
  await prisma.subcontractorPayment.create({
    data: { companyId, subcontractorId: subElectric.id, subcontractorCostId: subCost.id, amount: 12000, paidAt: daysFromNow(-9) },
  });
  console.log("  UA: 3 subcontractors, 3 compliance docs, 1 assignment, 1 review, 1 paid cost");

  // ---------- Suppliers ----------
  const supplierMaterials = await prisma.supplier.create({
    data: { companyId, name: "«Будматеріали Плюс»", email: "sales@budmaterialy-plus.example", phone: "+380 32 297 6655" },
  });
  const supplierMetal = await prisma.supplier.create({
    data: { companyId, name: "«МеталПром Україна»", email: "order@metalprom-ua.example", phone: "+380 56 244 1188" },
  });
  await prisma.supplier.create({
    data: { companyId, name: "«Електротовари Львів»", email: "shop@electro-lviv.example", phone: "+380 32 261 9900" },
  });

  await prisma.supplierDocument.create({
    data: { companyId, supplierId: supplierMaterials.id, type: "general_liability_insurance", name: "Поліс №SGL-3401", expiresAt: daysFromNow(150) },
  });
  await prisma.supplierReview.create({
    data: { companyId, supplierId: supplierMaterials.id, reviewedByUserId: ownerUserId, reviewedByName: ownerName, rating: 4, wouldReorder: true, comments: "Стабільні поставки, іноді затримка на 1-2 дні." },
  });

  const po = await prisma.purchaseOrder.create({
    data: { companyId, supplierId: supplierMetal.id, status: "ordered", expectedDate: daysFromNow(6) },
  });
  await prisma.purchaseOrderLine.create({
    data: { purchaseOrderId: po.id, materialCatalogItemId: base.materialIdByCode.get("REBAR")!, quantity: 2500, unitPrice: 1.1 },
  });
  console.log("  UA: 3 suppliers, 1 COI doc, 1 review, 1 purchase order");

  // ---------- Equipment ----------
  const excavator = await prisma.equipment.create({
    data: {
      companyId,
      name: "Екскаватор JCB 3CX",
      category: "Земляні роботи",
      serialNumber: "JCB-2018-77410",
      purchaseDate: daysFromNow(-900),
      purchaseCost: 65000,
      status: "in_use",
      currentMeterHours: 3420,
      maintenanceIntervalHours: 250,
    },
  });
  await prisma.equipment.create({
    data: { companyId, name: "Баштовий кран Liebherr", category: "Вантажопідйомна техніка", serialNumber: "LBH-2015-33221", status: "available", currentMeterHours: 8900 },
  });
  await prisma.equipmentFuelLog.create({
    data: { equipmentId: excavator.id, quantity: 120, cost: 220, meterHours: 3420 },
  });
  console.log("  UA: 2 equipment items, 1 fuel log");

  // ---------- Company COI ----------
  await prisma.companyDocument.createMany({
    data: [
      { companyId, type: "general_liability_insurance", name: "Поліс страхування цивільної відповідальності №CGL-9931", expiresAt: daysFromNow(200) },
      { companyId, type: "workers_comp_insurance", name: "Страхування працівників від нещасних випадків №WC-4471", expiresAt: daysFromNow(60) },
    ],
  });
  console.log("  UA: 2 company insurance documents");

  console.log("Seeded ТОВ «Карпати Буд» showcase data across projects, estimates, finance, team, safety, permits, subcontractors, suppliers, and equipment.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
