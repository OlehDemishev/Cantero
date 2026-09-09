import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { metricMaterials, metricRateItems } from "../src/estimates/starter-catalog-data";

const prisma = new PrismaClient();

const now = new Date();
/** Negative = past, positive = future — same convention as prisma/seed.ts's daysFromNow. */
function daysFromNow(d: number) {
  return new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
}
function midnight(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

const materialPriceByCode = new Map(metricMaterials.map((m) => [m.code, m.defaultUnitPrice]));
const rateItemDataByCode = new Map(metricRateItems.map((r) => [r.code, r]));

function computeLine(code: string, quantity: number, laborRatePerHour: number) {
  const ri = rateItemDataByCode.get(code)!;
  const materialsCost = round2(
    ri.materials.reduce((sum, m) => {
      const price = materialPriceByCode.get(m.materialCode)!;
      const waste = 1 + (m.wasteFactorPercent ?? 0) / 100;
      return sum + price * m.quantityPerUnit * quantity * waste;
    }, 0),
  );
  const laborCost = round2(ri.laborHoursPerUnit * quantity * laborRatePerHour);
  return { materialsCost, laborCost, lineTotal: round2(materialsCost + laborCost) };
}

function computeEstimateTotals(
  lines: { materialsCost: number; laborCost: number }[],
  markupPercent: number,
  taxPercent: number,
) {
  const materialsCostTotal = round2(lines.reduce((s, l) => s + l.materialsCost, 0));
  const laborCostTotal = round2(lines.reduce((s, l) => s + l.laborCost, 0));
  const subtotal = round2(materialsCostTotal + laborCostTotal);
  const markupAmount = round2((subtotal * markupPercent) / 100);
  const taxAmount = round2(((subtotal + markupAmount) * taxPercent) / 100);
  const grandTotal = round2(subtotal + markupAmount + taxAmount);
  return { materialsCostTotal, laborCostTotal, subtotal, markupAmount, taxAmount, grandTotal };
}

interface Base {
  companyId: string;
  ownerUserId: string;
  ownerName: string;
  materialIdByCode: Map<string, string>;
  rateItemIdByCode: Map<string, string>;
  costCodeIdByCode: Map<string, string>;
  clientNordwind: { id: string; name: string };
  clientHotel: { id: string; name: string };
  clientResidential: { id: string; name: string };
  clientAgro: { id: string; name: string };
  clientPlaza: { id: string; name: string };
  projectSample: { id: string; name: string };
  projectHotel: { id: string; name: string };
  projectResidential: { id: string; name: string };
  projectAgro: { id: string; name: string };
  workerForeman: { id: string; hourlyCost: number };
  workerElectrician: { id: string; hourlyCost: number };
  workerEstimator: { id: string; hourlyCost: number };
  workerCrane: { id: string; hourlyCost: number };
  workerOffice: { id: string; hourlyCost: number };
  warehouse: { id: string };
  equipmentExcavator: { id: string };
  equipmentCrane: { id: string };
  subElectric: { id: string };
  subHvac: { id: string };
  subRoofing: { id: string };
  supplierMaterials: { id: string };
  supplierMetal: { id: string };
  supplierElectro: { id: string };
  estimateHotel: { id: string };
  changeOrderHotelBad: { id: string };
  invoiceHotel1: { id: string; total: number };
  poRebar: { id: string };
}

async function loadBase(): Promise<Base> {
  const company = await prisma.company.findFirst({ where: { name: "ТОВ «Карпати Буд»" } });
  if (!company) throw new Error("ТОВ «Карпати Буд» not found — run prisma/seed.ts first");
  const companyId = company.id;

  const owner = await prisma.membership.findFirst({ where: { companyId, role: "owner" }, include: { user: true } });
  if (!owner) throw new Error("Owner membership not found");

  const materials = await prisma.materialCatalogItem.findMany({ where: { companyId } });
  const rateItems = await prisma.rateCatalogItem.findMany({ where: { companyId } });
  const costCodes = await prisma.costCode.findMany({ where: { companyId } });

  const byName = async <T extends { name: string }>(rows: T[], name: string): Promise<T> => {
    const row = rows.find((r) => r.name === name);
    if (!row) throw new Error(`Expected row named "${name}" not found`);
    return row;
  };

  const clients = await prisma.client.findMany({ where: { companyId } });
  const projects = await prisma.project.findMany({ where: { companyId } });
  const workers = await prisma.worker.findMany({ where: { companyId } });
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId } });
  const equipment = await prisma.equipment.findMany({ where: { companyId } });
  const subcontractors = await prisma.subcontractor.findMany({ where: { companyId } });
  const suppliers = await prisma.supplier.findMany({ where: { companyId } });
  const estimate = await prisma.estimate.findFirstOrThrow({ where: { companyId } });
  const changeOrder = await prisma.changeOrder.findFirstOrThrow({ where: { companyId } });
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { companyId } });
  const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { companyId } });

  return {
    companyId,
    ownerUserId: owner.userId,
    ownerName: owner.user.name,
    materialIdByCode: new Map(materials.map((m) => [m.code, m.id])),
    rateItemIdByCode: new Map(rateItems.map((r) => [r.code, r.id])),
    costCodeIdByCode: new Map(costCodes.map((c) => [c.code, c.id])),
    clientNordwind: await byName(clients, "Nordwind Bau AG"),
    clientHotel: await byName(clients, "Готель «Карпатський Затишок»"),
    clientResidential: await byName(clients, "ЖК «Дніпровський» — забудовник"),
    clientAgro: await byName(clients, "ПрАТ «Агро-Захід»"),
    clientPlaza: await byName(clients, "«Дніпро Плаза» — бізнес-центр"),
    projectSample: await byName(projects, "Sample Renovation Project"),
    projectHotel: await byName(projects, "Реконструкція готелю «Карпатський Затишок»"),
    projectResidential: await byName(projects, "Житловий комплекс «Дніпровський», черга 2"),
    projectAgro: await byName(projects, "Складський комплекс «Агро-Захід»"),
    workerForeman: { ...(await byName(workers, "Олег Мельник")), hourlyCost: 350 },
    workerElectrician: { ...(await byName(workers, "Тарас Бондаренко")), hourlyCost: 280 },
    workerEstimator: { ...(await byName(workers, "Ірина Коваль")), hourlyCost: 260 },
    workerCrane: { ...(await byName(workers, "Андрій Савчук")), hourlyCost: 300 },
    workerOffice: { ...(await byName(workers, "Марія Гончар")), hourlyCost: 220 },
    warehouse,
    equipmentExcavator: await byName(equipment, "Екскаватор JCB 3CX"),
    equipmentCrane: await byName(equipment, "Баштовий кран Liebherr"),
    subElectric: await byName(subcontractors, "«ЕлектроМонтаж Захід» ТОВ"),
    subHvac: await byName(subcontractors, "«ТеплоБуд Сервіс»"),
    subRoofing: await byName(subcontractors, "«Дах і Фасад»"),
    supplierMaterials: await byName(suppliers, "«Будматеріали Плюс»"),
    supplierMetal: await byName(suppliers, "«МеталПром Україна»"),
    supplierElectro: await byName(suppliers, "«Електротовари Львів»"),
    estimateHotel: estimate,
    changeOrderHotelBad: changeOrder,
    invoiceHotel1: { id: invoice.id, total: Number(invoice.total) },
    poRebar: po,
  };
}

/** The change-order title got doubled by a form_input/type race during earlier live UI testing —
 * fix it here rather than leave visibly-broken demo data. */
async function fixChangeOrderTitle(base: Base) {
  await prisma.changeOrder.update({
    where: { id: base.changeOrderHotelBad.id },
    data: {
      title: "Додаткове облицювання сходів",
      description: "Заміна типового облицювання сходових маршів на кам'яні плити за побажанням замовника.",
    },
  });
  console.log("Fixed change order title");
}

async function payExistingInvoice(base: Base) {
  await prisma.payment.create({
    data: {
      invoiceId: base.invoiceHotel1.id,
      amount: base.invoiceHotel1.total,
      method: "bank_transfer",
      paidAt: daysFromNow(-5),
    },
  });
  await prisma.invoice.update({ where: { id: base.invoiceHotel1.id }, data: { status: "paid" } });
  console.log("Recorded full payment on РАХ-2026-001");
}

async function seedWorkersAndWages(base: Base) {
  const wcMason = await prisma.wageClassification.create({
    data: { companyId: base.companyId, trade: "Муляр", hourlyRate: 300, fringeRate: 20 },
  });
  const wcElectrician = await prisma.wageClassification.create({
    data: { companyId: base.companyId, trade: "Електрик", hourlyRate: 280, fringeRate: 15 },
  });
  const wcCarpenter = await prisma.wageClassification.create({
    data: { companyId: base.companyId, trade: "Тесляр", hourlyRate: 270, fringeRate: 15 },
  });
  void wcMason;

  const workerCarpenter = await prisma.worker.create({
    data: {
      companyId: base.companyId,
      name: "Василь Дорошенко",
      role: "Тесляр",
      hourlyCost: 270,
      phone: "+380661234567",
      preferredLocale: "uk",
      wageClassificationId: wcCarpenter.id,
    },
  });
  const workerAccountant = await prisma.worker.create({
    data: { companyId: base.companyId, name: "Наталія Шевченко", role: "Бухгалтер", hourlyCost: 240 },
  });

  await prisma.worker.update({ where: { id: base.workerElectrician.id }, data: { wageClassificationId: wcElectrician.id } });

  await prisma.workerOnboardingTask.createMany({
    data: [
      { companyId: base.companyId, workerId: workerCarpenter.id, title: "Підписання трудового договору", done: true, completedAt: daysFromNow(-40), sortOrder: 0 },
      { companyId: base.companyId, workerId: workerCarpenter.id, title: "Інструктаж з охорони праці", done: true, completedAt: daysFromNow(-39), sortOrder: 1 },
      { companyId: base.companyId, workerId: workerCarpenter.id, title: "Видача спецодягу та ЗІЗ", done: true, completedAt: daysFromNow(-39), sortOrder: 2 },
      { companyId: base.companyId, workerId: workerCarpenter.id, title: "Ознайомлення з об'єктом", done: false, sortOrder: 3 },
      { companyId: base.companyId, workerId: workerAccountant.id, title: "Підписання трудового договору", done: true, completedAt: daysFromNow(-25), sortOrder: 0 },
      { companyId: base.companyId, workerId: workerAccountant.id, title: "Налаштування доступу до системи", done: true, completedAt: daysFromNow(-24), sortOrder: 1 },
      { companyId: base.companyId, workerId: workerAccountant.id, title: "Передача документації від попереднього бухгалтера", done: false, sortOrder: 2 },
    ],
  });

  console.log("Seeded 2 new workers, 3 wage classifications, 7 onboarding tasks");
  return { workerCarpenter, workerAccountant };
}

async function seedCrmPipeline(base: Base) {
  // Backfilled stage history for clients already at their final stage.
  await prisma.clientStageHistory.createMany({
    data: [
      { companyId: base.companyId, clientId: base.clientHotel.id, fromStage: "lead", toStage: "contacted", changedAt: daysFromNow(-95) },
      { companyId: base.companyId, clientId: base.clientHotel.id, fromStage: "contacted", toStage: "qualified", changedAt: daysFromNow(-80) },
      { companyId: base.companyId, clientId: base.clientHotel.id, fromStage: "qualified", toStage: "won", changedAt: daysFromNow(-60) },
      { companyId: base.companyId, clientId: base.clientResidential.id, fromStage: "lead", toStage: "contacted", changedAt: daysFromNow(-150) },
      { companyId: base.companyId, clientId: base.clientResidential.id, fromStage: "contacted", toStage: "qualified", changedAt: daysFromNow(-135) },
      { companyId: base.companyId, clientId: base.clientResidential.id, fromStage: "qualified", toStage: "won", changedAt: daysFromNow(-120) },
      { companyId: base.companyId, clientId: base.clientAgro.id, fromStage: "lead", toStage: "contacted", changedAt: daysFromNow(-70) },
      { companyId: base.companyId, clientId: base.clientAgro.id, fromStage: "contacted", toStage: "qualified", changedAt: daysFromNow(-45) },
    ],
  });

  // Nordwind Bau AG moves to "won" — this project becomes the completed one with a warranty story.
  await prisma.client.update({
    where: { id: base.clientNordwind.id },
    data: { stage: "won", wonAt: daysFromNow(-100) },
  });
  await prisma.clientStageHistory.create({
    data: { companyId: base.companyId, clientId: base.clientNordwind.id, fromStage: "contacted", toStage: "won", changedAt: daysFromNow(-100) },
  });

  // Агро-Захід progresses to "won" once its new estimate/invoice (below) is issued.
  await prisma.client.update({
    where: { id: base.clientAgro.id },
    data: { stage: "won", wonAt: daysFromNow(-10), probability: 100 },
  });
  await prisma.clientStageHistory.create({
    data: { companyId: base.companyId, clientId: base.clientAgro.id, fromStage: "qualified", toStage: "won", changedAt: daysFromNow(-10) },
  });

  const campaign = await prisma.marketingCampaign.create({
    data: {
      companyId: base.companyId,
      name: "Весняна кампанія в Google Ads",
      channel: "google_ads",
      spend: 1500,
      startDate: daysFromNow(-90),
      endDate: daysFromNow(-20),
      notes: "Таргетинг на власників комерційної нерухомості у Дніпрі та Львові.",
    },
  });
  await prisma.client.update({ where: { id: base.clientPlaza.id }, data: { campaignId: campaign.id, source: "google_ads" } });

  const lostLead = await prisma.client.create({
    data: {
      companyId: base.companyId,
      name: "ФОП Іваненко — приватний будинок",
      email: "ivanenko.priv@example.com",
      phone: "+380 97 456 7890",
      stage: "lost",
      lostAt: daysFromNow(-35),
      lostReason: "Обрали іншого підрядника за нижчою ціною",
      estimatedValue: 28000,
      probability: 0,
      source: "google_ads",
      campaignId: campaign.id,
    },
  });
  await prisma.clientStageHistory.createMany({
    data: [
      { companyId: base.companyId, clientId: lostLead.id, fromStage: null, toStage: "lead", changedAt: daysFromNow(-55) },
      { companyId: base.companyId, clientId: lostLead.id, fromStage: "lead", toStage: "contacted", changedAt: daysFromNow(-48) },
      { companyId: base.companyId, clientId: lostLead.id, fromStage: "contacted", toStage: "lost", changedAt: daysFromNow(-35) },
    ],
  });

  const referredWon = await prisma.client.create({
    data: {
      companyId: base.companyId,
      name: "«Буковинська Мануфактура» ТОВ",
      email: "office@bukovyna-manufactura.example",
      phone: "+380 372 55 66 77",
      stage: "won",
      wonAt: daysFromNow(-15),
      estimatedValue: 76000,
      referredByClientId: base.clientHotel.id,
      referralRewardStatus: "pending",
      referralRewardAmount: 750,
      source: "referral",
    },
  });
  await prisma.clientStageHistory.createMany({
    data: [
      { companyId: base.companyId, clientId: referredWon.id, fromStage: null, toStage: "lead", changedAt: daysFromNow(-42) },
      { companyId: base.companyId, clientId: referredWon.id, fromStage: "lead", toStage: "contacted", changedAt: daysFromNow(-38) },
      { companyId: base.companyId, clientId: referredWon.id, fromStage: "contacted", toStage: "qualified", changedAt: daysFromNow(-28) },
      { companyId: base.companyId, clientId: referredWon.id, fromStage: "qualified", toStage: "won", changedAt: daysFromNow(-15) },
    ],
  });

  await prisma.clientActivity.createMany({
    data: [
      { companyId: base.companyId, clientId: base.clientHotel.id, type: "call", content: "Обговорили графік завершення оздоблювальних робіт.", createdAt: daysFromNow(-8) },
      { companyId: base.companyId, clientId: base.clientResidential.id, type: "meeting", content: "Зустріч на об'єкті з представником забудовника, погоджено обсяг черги 2.", createdAt: daysFromNow(-30) },
      { companyId: base.companyId, clientId: base.clientAgro.id, type: "email", content: "Надіслано фінальний кошторис на затвердження.", createdAt: daysFromNow(-11) },
      { companyId: base.companyId, clientId: base.clientPlaza.id, type: "note", content: "Цікавляться термінами старту, бюджет ще не підтверджено.", createdAt: daysFromNow(-5) },
      { companyId: base.companyId, clientId: referredWon.id, type: "call", content: "Подякували за рекомендацію від Готелю «Карпатський Затишок», обговорили обсяг робіт.", createdAt: daysFromNow(-40) },
    ],
  });

  await prisma.clientReminder.createMany({
    data: [
      { companyId: base.companyId, clientId: base.clientPlaza.id, title: "Зателефонувати щодо підтвердження бюджету", dueDate: daysFromNow(4), done: false },
      { companyId: base.companyId, clientId: base.clientResidential.id, title: "Надіслати акт виконаних робіт за поточний етап", dueDate: daysFromNow(-2), done: true },
    ],
  });

  console.log("Seeded CRM: stage history, 1 campaign, 2 new leads (1 lost, 1 won via referral), activities, reminders");
  return { lostLead, referredWon, campaign };
}

async function seedResidentialEstimate(base: Base) {
  const laborRate = 22;
  const lineSpecs: { code: string; qty: number; costCode: string }[] = [
    { code: "RC-DRYWALL-PARTITION", qty: 800, costCode: "09 00 00" },
    { code: "RC-PAINT-WALL", qty: 1200, costCode: "09 00 00" },
    { code: "RC-PAINT-CEILING", qty: 600, costCode: "09 00 00" },
    { code: "RC-TILE-FLOOR", qty: 300, costCode: "09 00 00" },
    { code: "RC-ELECTRICAL-CIRCUIT", qty: 2000, costCode: "26 00 00" },
    { code: "RC-ELECTRICAL-SOCKET", qty: 150, costCode: "26 00 00" },
    { code: "RC-PLUMBING-DRAIN", qty: 400, costCode: "22 00 00" },
  ];
  const lines = lineSpecs.map((s) => ({ ...s, ...computeLine(s.code, s.qty, laborRate) }));
  const totals = computeEstimateTotals(lines, 12, 20);

  const estimate = await prisma.estimate.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectResidential.id,
      name: "Кошторис на оздоблювальні роботи — черга 2",
      status: "approved",
      laborRatePerHour: laborRate,
      markupPercent: 12,
      taxPercent: 20,
      clientDecision: "approved",
      sentAt: daysFromNow(-100),
      decisionAt: daysFromNow(-95),
      ...totals,
    },
  });
  for (const [i, l] of lines.entries()) {
    await prisma.estimateLine.create({
      data: {
        estimateId: estimate.id,
        rateCatalogItemId: base.rateItemIdByCode.get(l.code)!,
        quantity: l.qty,
        materialsCost: l.materialsCost,
        laborCost: l.laborCost,
        lineTotal: l.lineTotal,
        sortOrder: i,
        costCodeId: base.costCodeIdByCode.get(l.costCode),
      },
    });
  }

  const coLines = [{ code: "RC-PAINT-WALL", qty: 200, costCode: "09 00 00" }].map((s) => ({
    ...s,
    ...computeLine(s.code, s.qty, laborRate),
  }));
  const coTotals = computeEstimateTotals(coLines, 12, 20);
  const changeOrder = await prisma.changeOrder.create({
    data: {
      companyId: base.companyId,
      estimateId: estimate.id,
      number: 1,
      title: "Додаткове фарбування місць загального користування",
      description: "Забудовник замовив додаткове фарбування коридорів на поверхах 1-5.",
      status: "approved",
      clientDecision: "approved",
      sentAt: daysFromNow(-30),
      decisionAt: daysFromNow(-27),
      ...coTotals,
    },
  });
  await prisma.changeOrderLine.create({
    data: {
      changeOrderId: changeOrder.id,
      rateCatalogItemId: base.rateItemIdByCode.get("RC-PAINT-WALL")!,
      quantity: 200,
      materialsCost: coLines[0].materialsCost,
      laborCost: coLines[0].laborCost,
      lineTotal: coLines[0].lineTotal,
      sortOrder: 0,
      costCodeId: base.costCodeIdByCode.get("09 00 00"),
    },
  });

  const depositTotal = round2(totals.grandTotal * 0.3);
  const depositTax = round2(depositTotal - depositTotal / 1.2);
  const invoice1 = await prisma.invoice.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectResidential.id,
      clientId: base.clientResidential.id,
      estimateId: estimate.id,
      number: "РАХ-2026-002",
      status: "paid",
      subtotal: round2(depositTotal - depositTax),
      taxAmount: depositTax,
      total: depositTotal,
      dueDate: daysFromNow(-80),
    },
  });
  await prisma.invoiceLine.create({
    data: { invoiceId: invoice1.id, description: "Аванс за оздоблювальні роботи, черга 2 (30%)", quantity: 1, unitPrice: round2(depositTotal - depositTax), lineTotal: round2(depositTotal - depositTax) },
  });
  await prisma.payment.create({
    data: { invoiceId: invoice1.id, amount: depositTotal, method: "bank_transfer", paidAt: daysFromNow(-78) },
  });

  const drawTotal = round2(totals.grandTotal * 0.4);
  const drawTax = round2(drawTotal - drawTotal / 1.2);
  const invoice2 = await prisma.invoice.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectResidential.id,
      clientId: base.clientResidential.id,
      estimateId: estimate.id,
      number: "РАХ-2026-003",
      status: "sent",
      subtotal: round2(drawTotal - drawTax),
      taxAmount: drawTax,
      total: drawTotal,
      percentComplete: 40,
      dueDate: daysFromNow(10),
    },
  });
  await prisma.invoiceLine.create({
    data: { invoiceId: invoice2.id, description: "Проміжна оплата за виконані роботи (40% готовності)", quantity: 1, unitPrice: round2(drawTotal - drawTax), lineTotal: round2(drawTotal - drawTax) },
  });

  console.log(`Seeded residential estimate (${totals.grandTotal} EUR), 1 change order, 2 invoices (1 paid, 1 sent)`);
  return { estimate, lines };
}

async function seedAgroEstimate(base: Base) {
  const laborRate = 25;
  const lineSpecs: { code: string; qty: number; costCode: string }[] = [
    { code: "RC-CONCRETE-FOOTING", qty: 240, costCode: "03 00 00" },
    { code: "RC-CONCRETE-SLAB", qty: 1200, costCode: "03 00 00" },
    { code: "RC-FRAMING", qty: 900, costCode: "06 00 00" },
    { code: "RC-ROOFING", qty: 1200, costCode: "07 00 00" },
    { code: "RC-ELECTRICAL-CIRCUIT", qty: 500, costCode: "26 00 00" },
    { code: "RC-ELECTRICAL-SOCKET", qty: 20, costCode: "26 00 00" },
  ];
  const lines = lineSpecs.map((s) => ({ ...s, ...computeLine(s.code, s.qty, laborRate) }));
  const totals = computeEstimateTotals(lines, 18, 20);

  const estimate = await prisma.estimate.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectAgro.id,
      name: "Кошторис на будівництво складського комплексу",
      status: "approved",
      laborRatePerHour: laborRate,
      markupPercent: 18,
      taxPercent: 20,
      clientDecision: "approved",
      sentAt: daysFromNow(-20),
      decisionAt: daysFromNow(-12),
      ...totals,
    },
  });
  for (const [i, l] of lines.entries()) {
    await prisma.estimateLine.create({
      data: {
        estimateId: estimate.id,
        rateCatalogItemId: base.rateItemIdByCode.get(l.code)!,
        quantity: l.qty,
        materialsCost: l.materialsCost,
        laborCost: l.laborCost,
        lineTotal: l.lineTotal,
        sortOrder: i,
        costCodeId: base.costCodeIdByCode.get(l.costCode),
      },
    });
  }

  const coLines = [{ code: "RC-ELECTRICAL-CIRCUIT", qty: 100, costCode: "26 00 00" }].map((s) => ({
    ...s,
    ...computeLine(s.code, s.qty, laborRate),
  }));
  const coTotals = computeEstimateTotals(coLines, 18, 20);
  const changeOrder = await prisma.changeOrder.create({
    data: {
      companyId: base.companyId,
      estimateId: estimate.id,
      number: 1,
      title: "Додаткова силова розводка для холодильного обладнання",
      description: "Замовник додав окрему лінію живлення під холодильні камери.",
      status: "approved",
      clientDecision: "approved",
      sentAt: daysFromNow(-8),
      decisionAt: daysFromNow(-6),
      scheduleImpactDays: 3,
      ...coTotals,
    },
  });
  await prisma.changeOrderLine.create({
    data: {
      changeOrderId: changeOrder.id,
      rateCatalogItemId: base.rateItemIdByCode.get("RC-ELECTRICAL-CIRCUIT")!,
      quantity: 100,
      materialsCost: coLines[0].materialsCost,
      laborCost: coLines[0].laborCost,
      lineTotal: coLines[0].lineTotal,
      sortOrder: 0,
      costCodeId: base.costCodeIdByCode.get("26 00 00"),
    },
  });

  const depositTotal = round2(totals.grandTotal * 0.25);
  const depositTax = round2(depositTotal - depositTotal / 1.2);
  const invoice = await prisma.invoice.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectAgro.id,
      clientId: base.clientAgro.id,
      estimateId: estimate.id,
      number: "РАХ-2026-004",
      status: "sent",
      subtotal: round2(depositTotal - depositTax),
      taxAmount: depositTax,
      total: depositTotal,
      dueDate: daysFromNow(12),
    },
  });
  await prisma.invoiceLine.create({
    data: { invoiceId: invoice.id, description: "Аванс за будівництво складського комплексу (25%)", quantity: 1, unitPrice: round2(depositTotal - depositTax), lineTotal: round2(depositTotal - depositTax) },
  });

  console.log(`Seeded agro-warehouse estimate (${totals.grandTotal} EUR), 1 change order, 1 sent invoice`);
  return { estimate, lines };
}

async function seedHotelProjectDepth(base: Base) {
  await prisma.project.update({ where: { id: base.projectHotel.id }, data: { contingencyAmount: 15000 } });

  await prisma.milestone.createMany({
    data: [
      { projectId: base.projectHotel.id, name: "Здача фундаментних робіт", dueDate: daysFromNow(-30) },
      { projectId: base.projectHotel.id, name: "Завершення покрівельних робіт", dueDate: daysFromNow(20) },
      { projectId: base.projectHotel.id, name: "Здача об'єкта замовнику", dueDate: daysFromNow(60) },
    ],
  });

  await prisma.task.createMany({
    data: [
      { companyId: base.companyId, projectId: base.projectHotel.id, name: "Оздоблювальні роботи 1-го поверху", status: "in_progress", startDate: daysFromNow(-25), dueDate: daysFromNow(10) },
      { companyId: base.companyId, projectId: base.projectHotel.id, name: "Оздоблювальні роботи 2-го поверху", status: "planned", startDate: daysFromNow(11), dueDate: daysFromNow(40) },
      { companyId: base.companyId, projectId: base.projectHotel.id, name: "Фінальне прибирання та здача", status: "planned", startDate: daysFromNow(55), dueDate: daysFromNow(60) },
    ],
  });

  await prisma.rfi.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectHotel.id,
      number: "RFI-002",
      subject: "Колір затирки для підлогової плитки у вестибюлі",
      question: "У специфікації не вказано колір затирки — просимо підтвердити відповідність зразку №4 (світло-сірий).",
      priority: "low",
      status: "closed",
      askedByUserId: base.ownerUserId,
      askedByName: base.ownerName,
      answer: "Підтверджено, використовувати зразок №4.",
      answeredAt: daysFromNow(-18),
      answeredByName: base.clientHotel.name,
      closedAt: daysFromNow(-17),
      closedByUserId: base.ownerUserId,
      closedByName: base.ownerName,
      createdAt: daysFromNow(-20),
    },
  });

  await prisma.punchListItem.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectHotel.id,
      title: "Нерівний шов між плиткою на сходовому майданчику",
      location: "2-й поверх, сходовий майданчик",
      status: "verified",
      assigneeWorkerId: base.workerForeman.id,
      createdByUserId: base.ownerUserId,
      createdByName: base.ownerName,
      createdAt: daysFromNow(-15),
      resolvedAt: daysFromNow(-10),
      resolvedByUserId: base.ownerUserId,
      resolvedByName: base.ownerName,
      verifiedAt: daysFromNow(-8),
      verifiedByUserId: base.ownerUserId,
      verifiedByName: base.ownerName,
    },
  });

  await prisma.submittal.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectHotel.id,
      number: "SUB-002",
      title: "Зразок фарби для фасаду",
      specSection: "09 00 00",
      status: "approved",
      dueDate: daysFromNow(-25),
      submittedAt: daysFromNow(-28),
      submittedByUserId: base.ownerUserId,
      submittedByName: base.ownerName,
      reviewedAt: daysFromNow(-24),
      reviewedByName: base.clientHotel.name,
      reviewComments: "Затверджено без зауважень.",
    },
  });

  await prisma.contingencyDraw.createMany({
    data: [
      {
        companyId: base.companyId,
        projectId: base.projectHotel.id,
        amount: 1800,
        reason: "Непередбачені витрати на посилення фундаменту через ґрунтові умови.",
        createdByUserId: base.ownerUserId,
        createdByName: base.ownerName,
        createdAt: daysFromNow(-55),
      },
      {
        companyId: base.companyId,
        projectId: base.projectHotel.id,
        amount: 650,
        reason: "Додаткова оренda генератора під час перебоїв з електропостачанням.",
        createdByUserId: base.ownerUserId,
        createdByName: base.ownerName,
        createdAt: daysFromNow(-22),
      },
    ],
  });

  console.log("Seeded hotel project depth: contingency, milestones, tasks, RFI, punch item, submittal, 2 draws");
}

async function seedTimeAndDailyLogs(base: Base, extraWorkers: { workerCarpenter: { id: string }; workerAccountant: { id: string } }) {
  const allDays: Date[] = [];
  for (let d = 119; d >= 1; d--) {
    const dt = midnight(daysFromNow(-d));
    const day = dt.getDay();
    if (day !== 0 && day !== 6) allDays.push(dt);
  }
  const hotelDays = allDays;
  const residentialDays = allDays.filter((_, i) => i % 2 === 0);
  const agroDays = allDays.filter((_, i) => i % 3 === 0);

  const timeEntries: {
    companyId: string;
    workerId: string;
    projectId: string;
    hours: number;
    date: Date;
    hourlyCostSnapshot: number;
  }[] = [];

  hotelDays.forEach((date, i) => {
    timeEntries.push({ companyId: base.companyId, workerId: base.workerForeman.id, projectId: base.projectHotel.id, hours: 8, date, hourlyCostSnapshot: base.workerForeman.hourlyCost });
    if (i % 2 === 0) timeEntries.push({ companyId: base.companyId, workerId: base.workerElectrician.id, projectId: base.projectHotel.id, hours: 7.5, date, hourlyCostSnapshot: base.workerElectrician.hourlyCost });
    if (i % 5 === 0) timeEntries.push({ companyId: base.companyId, workerId: base.workerCrane.id, projectId: base.projectHotel.id, hours: 6, date, hourlyCostSnapshot: base.workerCrane.hourlyCost });
  });
  residentialDays.forEach((date, i) => {
    timeEntries.push({ companyId: base.companyId, workerId: extraWorkers.workerCarpenter.id, projectId: base.projectResidential.id, hours: 8, date, hourlyCostSnapshot: 270 });
    if (i % 3 === 0) timeEntries.push({ companyId: base.companyId, workerId: base.workerElectrician.id, projectId: base.projectResidential.id, hours: 7, date, hourlyCostSnapshot: base.workerElectrician.hourlyCost });
  });
  agroDays.forEach((date, i) => {
    timeEntries.push({ companyId: base.companyId, workerId: base.workerCrane.id, projectId: base.projectAgro.id, hours: 6, date, hourlyCostSnapshot: base.workerCrane.hourlyCost });
    if (i % 4 === 0) timeEntries.push({ companyId: base.companyId, workerId: extraWorkers.workerCarpenter.id, projectId: base.projectAgro.id, hours: 8, date, hourlyCostSnapshot: 270 });
  });

  await prisma.timeEntry.createMany({ data: timeEntries });

  const weather = ["clear", "cloudy", "rain", "clear", "cloudy"] as const;
  const hotelWork = [
    "Оздоблювальні роботи на 1-му поверсі, монтаж гіпсокартонних перегородок.",
    "Електромонтажні роботи, прокладання кабельних трас.",
    "Плиткові роботи у санвузлах.",
    "Малярні роботи, нанесення другого шару фарби.",
    "Монтаж покрівельного утеплювача.",
  ];
  const residentialWork = [
    "Монтаж перегородок на поверхах 3-5.",
    "Малярні роботи в місцях загального користування.",
    "Укладання підлогової плитки в санвузлах квартир.",
    "Електромонтажні роботи, встановлення розеток.",
  ];
  const agroWork = [
    "Бетонування фундаментних стрічок.",
    "Монтаж каркасних конструкцій складу.",
    "Покрівельні роботи на основному корпусі.",
    "Прокладання силових кабельних ліній.",
  ];

  const dailyLogs: {
    companyId: string;
    projectId: string;
    date: Date;
    authorUserId: string;
    authorName: string;
    weatherCondition: (typeof weather)[number];
    crewCount: number;
    workPerformed: string;
  }[] = [];
  hotelDays.forEach((date, i) => {
    dailyLogs.push({
      companyId: base.companyId,
      projectId: base.projectHotel.id,
      date,
      authorUserId: base.ownerUserId,
      authorName: base.ownerName,
      weatherCondition: weather[i % weather.length],
      crewCount: i % 5 === 0 ? 4 : i % 2 === 0 ? 3 : 2,
      workPerformed: hotelWork[i % hotelWork.length],
    });
  });
  residentialDays.forEach((date, i) => {
    dailyLogs.push({
      companyId: base.companyId,
      projectId: base.projectResidential.id,
      date,
      authorUserId: base.ownerUserId,
      authorName: base.ownerName,
      weatherCondition: weather[(i + 1) % weather.length],
      crewCount: i % 3 === 0 ? 3 : 2,
      workPerformed: residentialWork[i % residentialWork.length],
    });
  });
  agroDays.forEach((date, i) => {
    dailyLogs.push({
      companyId: base.companyId,
      projectId: base.projectAgro.id,
      date,
      authorUserId: base.ownerUserId,
      authorName: base.ownerName,
      weatherCondition: weather[(i + 2) % weather.length],
      crewCount: 2,
      workPerformed: agroWork[i % agroWork.length],
    });
  });

  await prisma.dailyLog.createMany({ data: dailyLogs, skipDuplicates: true });

  console.log(`Seeded ${timeEntries.length} time entries and ${dailyLogs.length} daily logs across ~17 weeks`);
}

async function recordStock(
  base: Base,
  params: {
    materialCode: string;
    type: "receipt" | "issue" | "write_off";
    quantity: number;
    projectId?: string;
    estimateLineId?: string;
    unitCost?: number;
    createdAt: Date;
  },
) {
  const materialCatalogItemId = base.materialIdByCode.get(params.materialCode)!;
  const warehouseId = base.warehouse.id;
  const delta = params.type === "receipt" ? params.quantity : -params.quantity;

  const level = await prisma.stockLevel.findUnique({
    where: { warehouseId_materialCatalogItemId: { warehouseId, materialCatalogItemId } },
  });
  let averageCost: number | null = level?.averageCost != null ? Number(level.averageCost) : null;
  if (params.type === "receipt" && params.unitCost != null) {
    const oldQty = level ? Number(level.quantityOnHand) : 0;
    const oldAvg = averageCost ?? params.unitCost;
    const newQty = oldQty + params.quantity;
    averageCost = newQty > 0 ? round4((oldQty * oldAvg + params.quantity * params.unitCost) / newQty) : params.unitCost;
  }

  await prisma.stockMovement.create({
    data: {
      companyId: base.companyId,
      warehouseId,
      materialCatalogItemId,
      type: params.type,
      quantity: params.quantity,
      projectId: params.projectId,
      estimateLineId: params.estimateLineId,
      unitCost: params.type === "receipt" ? params.unitCost : (averageCost ?? undefined),
      createdAt: params.createdAt,
    },
  });

  await prisma.stockLevel.upsert({
    where: { warehouseId_materialCatalogItemId: { warehouseId, materialCatalogItemId } },
    create: { warehouseId, materialCatalogItemId, quantityOnHand: delta, averageCost: averageCost ?? undefined },
    update: { quantityOnHand: { increment: delta }, ...(averageCost !== null ? { averageCost } : {}) },
  });
}

async function seedMaterialsAndStock(
  base: Base,
  hotelLines: Map<string, string>,
  residentialLines: { code: string; id: string }[],
  agroLines: { code: string; id: string }[],
) {
  // The pre-existing PO (REBAR from МеталПром) finally arrives.
  const rebarLine = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: base.poRebar.id } });
  await prisma.purchaseOrder.update({ where: { id: base.poRebar.id }, data: { status: "received", receivedAt: daysFromNow(-95) } });
  await prisma.purchaseOrderLine.update({ where: { id: rebarLine.id }, data: { quantityReceived: rebarLine.quantity } });
  await recordStock(base, { materialCode: "REBAR", type: "receipt", quantity: Number(rebarLine.quantity), unitCost: Number(rebarLine.unitPrice), createdAt: daysFromNow(-95) });

  const po2 = await prisma.purchaseOrder.create({
    data: { companyId: base.companyId, supplierId: base.supplierMaterials.id, status: "received", receivedAt: daysFromNow(-80), acknowledgedAt: daysFromNow(-88) },
  });
  const po2Lines: { materialCode: string; quantity: number; unitPrice: number }[] = [
    { materialCode: "CONCRETE", quantity: 100, unitPrice: 105 },
    { materialCode: "CER-TILE", quantity: 500, unitPrice: 20 },
    { materialCode: "TILE-ADH", quantity: 800, unitPrice: 1.6 },
    { materialCode: "INSULATION", quantity: 1000, unitPrice: 8.0 },
    { materialCode: "PAINT-INT", quantity: 40, unitPrice: 9.0 },
  ];
  for (const l of po2Lines) {
    await prisma.purchaseOrderLine.create({
      data: { purchaseOrderId: po2.id, materialCatalogItemId: base.materialIdByCode.get(l.materialCode)!, quantity: l.quantity, unitPrice: l.unitPrice, quantityReceived: l.quantity },
    });
    await recordStock(base, { materialCode: l.materialCode, type: "receipt", quantity: l.quantity, unitCost: l.unitPrice, createdAt: daysFromNow(-80) });
  }
  const bill2 = await prisma.vendorBill.create({
    data: {
      companyId: base.companyId,
      supplierId: base.supplierMaterials.id,
      purchaseOrderId: po2.id,
      billNumber: "BUD-2026-114",
      billDate: daysFromNow(-79),
      dueDate: daysFromNow(-49),
      status: "paid",
      approvedAt: daysFromNow(-78),
      approvedByName: base.ownerName,
      paidAt: daysFromNow(-50),
    },
  });
  for (const l of po2Lines) {
    await prisma.vendorBillLine.create({
      data: { vendorBillId: bill2.id, materialCatalogItemId: base.materialIdByCode.get(l.materialCode)!, description: l.materialCode, quantity: l.quantity, unitPrice: l.unitPrice },
    });
  }

  const po3 = await prisma.purchaseOrder.create({
    data: { companyId: base.companyId, supplierId: base.supplierMetal.id, status: "received", receivedAt: daysFromNow(-50) },
  });
  const po3Lines: { materialCode: string; quantity: number; unitPrice: number }[] = [
    { materialCode: "REBAR", quantity: 5000, unitPrice: 1.05 },
    { materialCode: "TIMBER", quantity: 20, unitPrice: 460 },
  ];
  for (const l of po3Lines) {
    await prisma.purchaseOrderLine.create({
      data: { purchaseOrderId: po3.id, materialCatalogItemId: base.materialIdByCode.get(l.materialCode)!, quantity: l.quantity, unitPrice: l.unitPrice, quantityReceived: l.quantity },
    });
    await recordStock(base, { materialCode: l.materialCode, type: "receipt", quantity: l.quantity, unitCost: l.unitPrice, createdAt: daysFromNow(-50) });
  }
  const bill3 = await prisma.vendorBill.create({
    data: {
      companyId: base.companyId,
      supplierId: base.supplierMetal.id,
      purchaseOrderId: po3.id,
      billNumber: "MP-2026-0087",
      billDate: daysFromNow(-49),
      dueDate: daysFromNow(1),
      status: "approved",
      approvedAt: daysFromNow(-47),
      approvedByName: base.ownerName,
      scheduledPaymentDate: daysFromNow(1),
    },
  });
  for (const l of po3Lines) {
    await prisma.vendorBillLine.create({
      data: { vendorBillId: bill3.id, materialCatalogItemId: base.materialIdByCode.get(l.materialCode)!, description: l.materialCode, quantity: l.quantity, unitPrice: l.unitPrice },
    });
  }

  // Issues to projects, matching the real estimate lines where they exist.
  await recordStock(base, { materialCode: "CONCRETE", type: "issue", quantity: 18, projectId: base.projectHotel.id, estimateLineId: hotelLines.get("RC-CONCRETE-SLAB"), createdAt: daysFromNow(-58) });
  await recordStock(base, { materialCode: "REBAR", type: "issue", quantity: 1200, projectId: base.projectHotel.id, estimateLineId: hotelLines.get("RC-CONCRETE-SLAB"), createdAt: daysFromNow(-58) });
  await recordStock(base, { materialCode: "INSULATION", type: "issue", quantity: 308, projectId: base.projectHotel.id, estimateLineId: hotelLines.get("RC-ROOF-INSULATION"), createdAt: daysFromNow(-38) });
  await recordStock(base, { materialCode: "CER-TILE", type: "issue", quantity: 99.75, projectId: base.projectHotel.id, estimateLineId: hotelLines.get("RC-TILE-FLOOR"), createdAt: daysFromNow(-18) });
  await recordStock(base, { materialCode: "TILE-ADH", type: "issue", quantity: 380, projectId: base.projectHotel.id, estimateLineId: hotelLines.get("RC-TILE-FLOOR"), createdAt: daysFromNow(-18) });

  const residentialDrywall = residentialLines.find((l) => l.code === "RC-DRYWALL-PARTITION");
  const residentialTile = residentialLines.find((l) => l.code === "RC-TILE-FLOOR");
  await recordStock(base, { materialCode: "CER-TILE", type: "issue", quantity: 315, projectId: base.projectResidential.id, estimateLineId: residentialTile?.id, createdAt: daysFromNow(-70) });
  await recordStock(base, { materialCode: "TILE-ADH", type: "issue", quantity: 400, projectId: base.projectResidential.id, estimateLineId: residentialTile?.id, createdAt: daysFromNow(-70) });
  void residentialDrywall;

  const agroFooting = agroLines.find((l) => l.code === "RC-CONCRETE-FOOTING");
  const agroSlab = agroLines.find((l) => l.code === "RC-CONCRETE-SLAB");
  await recordStock(base, { materialCode: "CONCRETE", type: "issue", quantity: 60, projectId: base.projectAgro.id, estimateLineId: agroFooting?.id, createdAt: daysFromNow(-15) });
  await recordStock(base, { materialCode: "REBAR", type: "issue", quantity: 2880, projectId: base.projectAgro.id, estimateLineId: agroFooting?.id, createdAt: daysFromNow(-15) });
  await recordStock(base, { materialCode: "TIMBER", type: "issue", quantity: 16, projectId: base.projectAgro.id, estimateLineId: agroSlab?.id, createdAt: daysFromNow(-9) });

  await recordStock(base, { materialCode: "PAINT-INT", type: "write_off", quantity: 8, createdAt: daysFromNow(-33) });

  console.log("Seeded materials/stock: 1 PO received (backlog), 2 new POs+bills, 11 stock movements with StockLevel upserts");
}

async function seedHrDepth(base: Base, extraWorkers: { workerCarpenter: { id: string }; workerAccountant: { id: string } }) {
  await prisma.timeOffRequest.createMany({
    data: [
      { companyId: base.companyId, workerId: base.workerElectrician.id, type: "vacation", startDate: daysFromNow(-60), endDate: daysFromNow(-54), status: "approved", decidedByUserId: base.ownerUserId, decidedAt: daysFromNow(-65) },
      { companyId: base.companyId, workerId: base.workerCrane.id, type: "sick", startDate: daysFromNow(-20), endDate: daysFromNow(-18), status: "approved", decidedByUserId: base.ownerUserId, decidedAt: daysFromNow(-20) },
      { companyId: base.companyId, workerId: extraWorkers.workerCarpenter.id, type: "vacation", startDate: daysFromNow(20), endDate: daysFromNow(27), status: "pending" },
      { companyId: base.companyId, workerId: base.workerOffice.id, type: "unpaid", startDate: daysFromNow(-90), endDate: daysFromNow(-88), status: "denied", decidedByUserId: base.ownerUserId, decidedAt: daysFromNow(-92), reason: "Пік завантаження в офісі" },
    ],
  });

  const cycle = await prisma.performanceReviewCycle.create({
    data: { companyId: base.companyId, name: "Півріччя 1, 2026", periodStart: daysFromNow(-180), periodEnd: daysFromNow(-1), status: "closed" },
  });
  await prisma.performanceReview.createMany({
    data: [
      { companyId: base.companyId, cycleId: cycle.id, workerId: base.workerForeman.id, reviewerName: base.ownerName, rating: "exceeds_expectations", strengths: "Відмінна організація бригади, дотримання термінів.", improvementAreas: "Документування щоденних звітів.", submittedAt: daysFromNow(-30) },
      { companyId: base.companyId, cycleId: cycle.id, workerId: base.workerElectrician.id, reviewerName: base.ownerName, rating: "meets_expectations", strengths: "Якісна робота, відповідальність.", improvementAreas: "Підвищення кваліфікації з нових стандартів.", submittedAt: daysFromNow(-29) },
      { companyId: base.companyId, cycleId: cycle.id, workerId: base.workerOffice.id, reviewerName: base.ownerName, rating: "meets_expectations", strengths: "Точність у документообігу.", submittedAt: daysFromNow(-28) },
    ],
  });
  await prisma.performanceGoal.createMany({
    data: [
      { companyId: base.companyId, workerId: base.workerForeman.id, title: "Пройти курс з управління будівельними проєктами", targetDate: daysFromNow(90), progressPercent: 40 },
      { companyId: base.companyId, workerId: base.workerElectrician.id, title: "Отримати V групу допуску з електробезпеки", targetDate: daysFromNow(120), progressPercent: 20 },
    ],
  });

  const course = await prisma.trainingCourse.create({
    data: { companyId: base.companyId, title: "Охорона праці на будівництві", description: "Базовий курс з техніки безпеки на будівельному майданчику.", category: "Безпека", validityMonths: 12 },
  });
  await prisma.trainingEnrollment.createMany({
    data: [
      { companyId: base.companyId, courseId: course.id, workerId: base.workerForeman.id, status: "completed", enrolledAt: daysFromNow(-100), completedAt: daysFromNow(-95), score: 92 },
      { companyId: base.companyId, courseId: course.id, workerId: base.workerElectrician.id, status: "completed", enrolledAt: daysFromNow(-100), completedAt: daysFromNow(-94), score: 88 },
      { companyId: base.companyId, courseId: course.id, workerId: extraWorkers.workerCarpenter.id, status: "enrolled", enrolledAt: daysFromNow(-10) },
    ],
  });

  const plan = await prisma.benefitPlan.create({ data: { companyId: base.companyId, name: "Медичне страхування", type: "medical", carrier: "УкрСтрахування" } });
  const tierBasic = await prisma.benefitPlanTier.create({ data: { companyId: base.companyId, planId: plan.id, name: "Базовий", monthlyEmployerCost: 45, monthlyEmployeeCost: 10 } });
  const tierExtended = await prisma.benefitPlanTier.create({ data: { companyId: base.companyId, planId: plan.id, name: "Розширений", monthlyEmployerCost: 80, monthlyEmployeeCost: 25 } });
  await prisma.benefitEnrollment.createMany({
    data: [
      { companyId: base.companyId, workerId: base.workerForeman.id, planId: plan.id, tierId: tierExtended.id, effectiveDate: daysFromNow(-300), status: "active" },
      { companyId: base.companyId, workerId: base.workerElectrician.id, planId: plan.id, tierId: tierBasic.id, effectiveDate: daysFromNow(-200), status: "active" },
      { companyId: base.companyId, workerId: extraWorkers.workerAccountant.id, planId: plan.id, tierId: tierBasic.id, effectiveDate: daysFromNow(-25), status: "active" },
    ],
  });

  const hrCase = await prisma.hrCase.create({
    data: { companyId: base.companyId, workerId: base.workerCrane.id, reporterName: base.ownerName, category: "attendance", severity: "low", status: "resolved", description: "Кілька запізнень поспіль на початок зміни.", closedAt: daysFromNow(-40) },
  });
  await prisma.hrCaseAction.create({
    data: { companyId: base.companyId, caseId: hrCase.id, type: "coaching", description: "Проведено бесіду щодо дотримання графіка, узгоджено гнучкий початок зміни на 30 хв.", createdByName: base.ownerName, actionDate: daysFromNow(-40), acknowledgedAt: daysFromNow(-40) },
  });

  const posting = await prisma.jobPosting.create({
    data: { companyId: base.companyId, title: "Муляр", trade: "Мулярні роботи", location: "Івано-Франківська обл.", description: "Потрібен досвідчений муляр на об'єкт реконструкції готелю.", status: "open" },
  });
  const candidate1 = await prisma.candidate.create({
    data: { companyId: base.companyId, jobPostingId: posting.id, name: "Микола Гриценко", email: "hrytsenko.m@example.com", phone: "+380 50 999 1122", source: "Робота.ua", stage: "interviewing" },
  });
  await prisma.candidate.create({
    data: { companyId: base.companyId, jobPostingId: posting.id, name: "Степан Кравець", email: "kravets.s@example.com", source: "Реферал", stage: "screening" },
  });
  await prisma.interview.create({
    data: { companyId: base.companyId, candidateId: candidate1.id, scheduledAt: daysFromNow(-3), interviewerName: base.ownerName, notes: "Гарний досвід, 8 років на об'єктах комерційної нерухомості.", rating: 4 },
  });

  console.log("Seeded HR depth: time off, review cycle, training, benefits, HR case, recruiting");
}

async function seedSafetyDepth(base: Base) {
  await prisma.incidentReport.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectResidential.id,
      occurredAt: daysFromNow(-45),
      severity: "first_aid",
      description: "Поріз руки під час різання гіпсокартону, надано першу допомогу на місці.",
      location: "3-й поверх",
      correctiveActions: "Проведено додатковий інструктаж з техніки роботи з ручним інструментом.",
      oshaRecordable: false,
      reportedByUserId: base.ownerUserId,
      reportedByName: base.ownerName,
    },
  });

  const briefing2 = await prisma.safetyBriefing.create({
    data: { companyId: base.companyId, projectId: base.projectResidential.id, date: daysFromNow(-44), topic: "Безпечна робота з ручним електроінструментом", conductedByUserId: base.ownerUserId, conductedByName: base.ownerName },
  });
  await prisma.safetyBriefingAttendance.createMany({
    data: [base.workerElectrician, base.workerCrane].map((w) => ({ briefingId: briefing2.id, workerId: w.id })),
  });

  const jha2 = await prisma.jobHazardAnalysis.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectAgro.id,
      date: daysFromNow(-16),
      taskDescription: "Монтаж каркасних конструкцій на висоті",
      hazards: "Падіння з висоти, падіння елементів конструкції, затиснення кінцівок.",
      controlMeasures: "Використання страхувальних поясів, огородження зони монтажу, сигнальник під час підйому вантажів.",
      requiredPpe: "Каска, страхувальний пояс, рукавиці",
      conductedByUserId: base.ownerUserId,
      conductedByName: base.ownerName,
    },
  });
  await prisma.jhaAcknowledgment.create({ data: { jhaId: jha2.id, workerId: base.workerCrane.id } });

  await prisma.safetyObservation.createMany({
    data: [
      { companyId: base.companyId, projectId: base.projectHotel.id, category: "safe", behaviorObserved: "Всі працівники бригади використовували каски та страхувальні пояси на висоті.", observerUserId: base.ownerUserId, observerName: base.ownerName, observedAt: daysFromNow(-12) },
      { companyId: base.companyId, projectId: base.projectAgro.id, category: "at_risk", behaviorObserved: "Виявлено складування матеріалів занадто близько до краю перекриття.", correctiveAction: "Матеріали переміщено, проведено коротку бесіду з бригадою.", observerUserId: base.ownerUserId, observerName: base.ownerName, observedAt: daysFromNow(-6) },
    ],
  });

  await prisma.insuranceClaim.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectResidential.id,
      claimType: "workers_comp",
      status: "under_review",
      insurerName: "СК «Універсальна»",
      policyNumber: "WC-UA-88213",
      dateFiled: daysFromNow(-44),
      description: "Заявка на компенсацію медичних витрат після незначної травми руки на об'єкті.",
      adjusterName: "Оксана Прокопенко",
      claimAmount: 350,
      createdByUserId: base.ownerUserId,
      createdByName: base.ownerName,
    },
  });

  console.log("Seeded safety depth: 1 incident, 1 briefing, 1 JHA, 2 observations, 1 insurance claim");
}

async function seedEquipmentDepth(base: Base) {
  await prisma.equipmentFuelLog.createMany({
    data: [
      { equipmentId: base.equipmentExcavator.id, quantity: 95, cost: 175, meterHours: 3510, filledAt: daysFromNow(-40) },
      { equipmentId: base.equipmentCrane.id, quantity: 60, cost: 110, meterHours: 8950, filledAt: daysFromNow(-25) },
    ],
  });
  await prisma.equipmentMaintenanceRecord.create({
    data: { equipmentId: base.equipmentExcavator.id, description: "Планове ТО: заміна масла та фільтрів", cost: 420, meterHours: 3500, performedAt: daysFromNow(-42) },
  });

  await prisma.equipmentAssignment.createMany({
    data: [
      { equipmentId: base.equipmentExcavator.id, projectId: base.projectAgro.id, workerId: base.workerCrane.id, checkedOutAt: daysFromNow(-14), checkedInAt: daysFromNow(-2) },
      { equipmentId: base.equipmentCrane.id, projectId: base.projectHotel.id, workerId: base.workerCrane.id, checkedOutAt: daysFromNow(-56) },
    ],
  });

  const loan = await prisma.loan.create({
    data: { companyId: base.companyId, equipmentId: base.equipmentExcavator.id, lenderName: "УкрГазБанк Лізинг", principal: 55000, interestRatePercent: 9.5, termMonths: 36, startDate: daysFromNow(-900), status: "active" },
  });
  await prisma.loanPayment.createMany({
    data: [
      { companyId: base.companyId, loanId: loan.id, dueDate: daysFromNow(-30), principalPortion: 1300, interestPortion: 435, paidAt: daysFromNow(-30), paidAmount: 1735 },
      { companyId: base.companyId, loanId: loan.id, dueDate: daysFromNow(0), principalPortion: 1310, interestPortion: 425, paidAt: daysFromNow(0), paidAmount: 1735 },
      { companyId: base.companyId, loanId: loan.id, dueDate: daysFromNow(30), principalPortion: 1320, interestPortion: 415 },
    ],
  });

  await prisma.equipmentRental.create({
    data: { companyId: base.companyId, equipmentId: base.equipmentCrane.id, renterName: "«Дніпро Плаза» будівельний майданчик", renterContact: "+380 56 111 2233", dailyRate: 380, startDate: daysFromNow(-95), expectedReturnDate: daysFromNow(-88), actualReturnDate: daysFromNow(-88) },
  });

  const toolDrill = await prisma.toolCribItem.create({ data: { companyId: base.companyId, name: "Перфоратор Bosch GBH 5-40", replacementCost: 480, parLevel: 2, quantityOnHand: 3 } });
  const toolLevel = await prisma.toolCribItem.create({ data: { companyId: base.companyId, name: "Лазерний рівень Leica Rugby", replacementCost: 950, parLevel: 1, quantityOnHand: 1 } });
  await prisma.toolCheckout.createMany({
    data: [
      { companyId: base.companyId, itemId: toolDrill.id, workerId: base.workerElectrician.id, projectId: base.projectHotel.id, checkedOutAt: daysFromNow(-30), returnedAt: daysFromNow(-25), returnCondition: "good" },
      { companyId: base.companyId, itemId: toolLevel.id, workerId: base.workerForeman.id, projectId: base.projectResidential.id, checkedOutAt: daysFromNow(-10) },
    ],
  });
  await prisma.calibrationRecord.create({
    data: { companyId: base.companyId, toolCribItemId: toolLevel.id, calibratedAt: daysFromNow(-100), nextDueAt: daysFromNow(265), certificateNumber: "CAL-2026-0091", performedBy: "Leica Service Center Kyiv" },
  });

  console.log("Seeded equipment/fleet depth: fuel, maintenance, assignments, loan+payments, rental, tool crib+checkouts, calibration");
}

async function seedSubcontractorSupplierDepth(base: Base) {
  const cost2 = await prisma.subcontractorCost.create({
    data: { companyId: base.companyId, subcontractorId: base.subHvac.id, projectId: base.projectResidential.id, description: "Монтаж систем опалення, черга 2", amount: 18500, incurredDate: daysFromNow(-60), dueDate: daysFromNow(-30), paid: true, costCodeId: base.costCodeIdByCode.get("23 00 00") },
  });
  await prisma.subcontractorPayment.create({ data: { companyId: base.companyId, subcontractorId: base.subHvac.id, subcontractorCostId: cost2.id, amount: 18500, paidAt: daysFromNow(-32) } });

  const cost3 = await prisma.subcontractorCost.create({
    data: { companyId: base.companyId, subcontractorId: base.subRoofing.id, projectId: base.projectAgro.id, description: "Покрівельні роботи, основний корпус", amount: 9200, incurredDate: daysFromNow(-10), dueDate: daysFromNow(20), paid: false },
  });
  void cost3;

  const assignment2 = await prisma.subcontractorAssignment.create({
    data: { subcontractorId: base.subHvac.id, projectId: base.projectResidential.id, startDate: daysFromNow(-65), endDate: daysFromNow(-25), actualEndDate: daysFromNow(-28) },
  });
  await prisma.subcontractorPerformanceReview.create({
    data: { companyId: base.companyId, subcontractorId: base.subHvac.id, assignmentId: assignment2.id, reviewedByUserId: base.ownerUserId, reviewedByName: base.ownerName, rating: 4, onTime: false, reworkCount: 1, wouldHireAgain: true, comments: "Незначне запізнення зі здачею, якість робіт хороша." },
  });

  await prisma.supplierReview.create({
    data: { companyId: base.companyId, supplierId: base.supplierMetal.id, reviewedByUserId: base.ownerUserId, reviewedByName: base.ownerName, rating: 5, wouldReorder: true, comments: "Точні поставки, конкурентні ціни на арматуру." },
  });

  console.log("Seeded subcontractor/supplier depth: 2 costs+1 payment, 1 assignment, 1 performance review, 1 supplier review");
}

async function seedFinanceExtras(base: Base) {
  const jurisdiction = await prisma.taxJurisdiction.create({ data: { companyId: base.companyId, name: "Україна — ПДВ", country: "UA" } });
  await prisma.taxRate.create({ data: { companyId: base.companyId, jurisdictionId: jurisdiction.id, ratePercent: 20, effectiveFrom: daysFromNow(-365) } });

  await prisma.bankTransaction.createMany({
    data: [
      { companyId: base.companyId, date: daysFromNow(-5), description: "Надходження від Готель «Карпатський Затишок»", amount: base.invoiceHotel1.total, matchedInvoiceId: base.invoiceHotel1.id, reconciled: true },
      { companyId: base.companyId, date: daysFromNow(-45), description: "Оренда офісу, вересень", amount: -450, category: "other", reconciled: true },
      { companyId: base.companyId, date: daysFromNow(-30), description: "Паливна картка WOG", amount: -220, category: "fuel", reconciled: true },
      { companyId: base.companyId, date: daysFromNow(-2), description: "Комісія банку за обслуговування рахунку", amount: -15, reconciled: false },
    ],
  });

  const contract = await prisma.serviceContract.create({
    data: { companyId: base.companyId, projectId: base.projectSample.id, clientId: base.clientNordwind.id, title: "Планове технічне обслуговування", frequencyMonths: 6, startDate: daysFromNow(-90), nextVisitDate: daysFromNow(45) },
  });
  await prisma.serviceVisit.create({
    data: { serviceContractId: contract.id, companyId: base.companyId, scheduledDate: daysFromNow(-30), completedAt: daysFromNow(-30), technicianWorkerId: base.workerForeman.id, feedbackToken: randomUUID(), satisfactionRating: 5, satisfactionComment: "Все виконано швидко та якісно." },
  });

  const recurring = await prisma.recurringInvoice.create({
    data: { companyId: base.companyId, projectId: base.projectSample.id, clientId: base.clientNordwind.id, name: "Щомісячне технічне обслуговування", frequency: "monthly", taxPercent: 20, active: true, startDate: daysFromNow(-90), nextRunDate: daysFromNow(20) },
  });
  await prisma.recurringInvoiceLine.create({ data: { recurringInvoiceId: recurring.id, description: "Планове технічне обслуговування", quantity: 1, unitPrice: 150 } });

  console.log("Seeded finance extras: tax jurisdiction+rate, bank transactions, 1 service contract+visit, 1 recurring invoice");
}

async function seedWarrantyForSampleProject(base: Base) {
  const handoverDate = daysFromNow(-95);
  await prisma.project.update({ where: { id: base.projectSample.id }, data: { handoverDate, warrantyMonths: 24 } });

  await prisma.warrantyRegistration.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectSample.id,
      scope: "Загальні будівельні та оздоблювальні роботи",
      coverageType: "both",
      termMonths: 24,
      startDate: handoverDate,
      expirationDate: new Date(handoverDate.getTime() + 24 * 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.warrantyClaim.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectSample.id,
      title: "Протікання даху після сильного дощу",
      description: "Виявлено протікання в зоні димоходу після зливи.",
      location: "Дах",
      status: "resolved",
      submittedByName: base.clientNordwind.name,
      assigneeWorkerId: base.workerForeman.id,
      resolvedAt: daysFromNow(-60),
      resolvedByUserId: base.ownerUserId,
      resolvedByName: base.ownerName,
      resolutionNotes: "Повторно герметизовано примикання покрівлі до димоходу.",
      repairCost: 350,
      createdAt: daysFromNow(-65),
    },
  });

  console.log("Seeded warranty for the completed Sample Renovation Project: registration + 1 resolved claim");
}

async function seedLightTouches(base: Base) {
  const ticket = await prisma.supportTicket.create({
    data: {
      companyId: base.companyId,
      projectId: base.projectHotel.id,
      requesterClientId: base.clientHotel.id,
      requesterName: base.clientHotel.name,
      requesterEmail: "management@karpaty-hotel.example",
      subject: "Питання щодо гарантійного обслуговування вентиляції",
      category: "warranty",
      priority: "medium",
      status: "resolved",
      firstRespondedAt: daysFromNow(-6),
      resolvedAt: daysFromNow(-4),
    },
  });
  await prisma.ticketMessage.create({
    data: { companyId: base.companyId, ticketId: ticket.id, content: "Після запуску системи вентиляції чути стороннній шум у номерах 201-203, просимо перевірити.", authorName: base.clientHotel.name },
  });

  const task = await prisma.task.findFirst({ where: { projectId: base.projectHotel.id, name: "Демонтажні роботи" } });
  if (task) {
    await prisma.comment.create({ data: { companyId: base.companyId, taskId: task.id, authorUserId: base.ownerUserId, authorName: base.ownerName, content: "Демонтаж завершено, перевірено виконробом, готово до наступного етапу." } });
  }
  await prisma.comment.create({ data: { companyId: base.companyId, projectId: base.projectHotel.id, authorUserId: base.ownerUserId, authorName: base.ownerName, content: "Загальний прогрес по об'єкту відповідає графіку, наступний контрольний огляд — наступного тижня." } });

  const bidRequest = await prisma.bidRequest.create({
    data: { companyId: base.companyId, projectId: base.projectAgro.id, title: "Тендер на електромонтажні роботи складу", description: "Пошук субпідрядника на повний обсяг електромонтажних робіт складського комплексу.", dueDate: daysFromNow(-18), status: "awarded" },
  });
  await prisma.bidInvite.createMany({
    data: [
      { bidRequestId: bidRequest.id, subcontractorId: base.subElectric.id },
      { bidRequestId: bidRequest.id, subcontractorId: base.subHvac.id },
    ],
  });
  const bidWon = await prisma.bid.create({ data: { bidRequestId: bidRequest.id, subcontractorId: base.subElectric.id, amount: 21500, isAwarded: true, submittedAt: daysFromNow(-22) } });
  await prisma.bid.create({ data: { bidRequestId: bidRequest.id, subcontractorId: base.subHvac.id, amount: 24800, isAwarded: false, submittedAt: daysFromNow(-21) } });
  await prisma.bidLine.createMany({
    data: [
      { bidId: bidWon.id, description: "Силова розводка та освітлення", amount: 16000, sortOrder: 0 },
      { bidId: bidWon.id, description: "Розподільчі щити та автоматика", amount: 5500, sortOrder: 1 },
    ],
  });

  console.log("Seeded light touches: 1 support ticket+message, 2 comments, 1 bid request with 2 invites/bids");
}

async function main() {
  const base = await loadBase();
  console.log(`Loaded base company ТОВ «Карпати Буд» (${base.companyId})`);

  await fixChangeOrderTitle(base);
  await payExistingInvoice(base);
  const extraWorkers = await seedWorkersAndWages(base);
  await seedCrmPipeline(base);

  const hotelEstimateLines = await prisma.estimateLine.findMany({ where: { estimateId: base.estimateHotel.id }, include: { rateCatalogItem: true } });
  const hotelLinesByCode = new Map(hotelEstimateLines.map((l) => [l.rateCatalogItem.code, l.id]));

  const { lines: residentialLineSpecs, estimate: residentialEstimate } = await seedResidentialEstimate(base);
  const { lines: agroLineSpecs, estimate: agroEstimate } = await seedAgroEstimate(base);
  void residentialLineSpecs;
  void agroLineSpecs;

  const residentialLines = (
    await prisma.estimateLine.findMany({ where: { estimateId: residentialEstimate.id }, include: { rateCatalogItem: true } })
  ).map((l) => ({ code: l.rateCatalogItem.code, id: l.id }));
  const agroLines = (
    await prisma.estimateLine.findMany({ where: { estimateId: agroEstimate.id }, include: { rateCatalogItem: true } })
  ).map((l) => ({ code: l.rateCatalogItem.code, id: l.id }));

  await seedHotelProjectDepth(base);
  await seedTimeAndDailyLogs(base, extraWorkers);
  await seedMaterialsAndStock(base, hotelLinesByCode, residentialLines, agroLines);
  await seedHrDepth(base, extraWorkers);
  await seedSafetyDepth(base);
  await seedEquipmentDepth(base);
  await seedSubcontractorSupplierDepth(base);
  await seedFinanceExtras(base);
  await seedWarrantyForSampleProject(base);
  await seedLightTouches(base);

  console.log("\nDemo-history enrichment complete for ТОВ «Карпати Буд».");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
