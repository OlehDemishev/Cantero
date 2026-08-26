import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
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

/** A trimmed CSI MasterFormat starter set — enough divisions to classify a typical
 * renovation/commercial job without overwhelming a first-time user. */
const STARTER_COST_CODES = [
  { code: "01 00 00", name: "General Requirements" },
  { code: "02 00 00", name: "Existing Conditions" },
  { code: "03 00 00", name: "Concrete" },
  { code: "04 00 00", name: "Masonry" },
  { code: "05 00 00", name: "Metals" },
  { code: "06 00 00", name: "Wood, Plastics, and Composites" },
  { code: "07 00 00", name: "Thermal and Moisture Protection" },
  { code: "08 00 00", name: "Openings" },
  { code: "09 00 00", name: "Finishes" },
  { code: "10 00 00", name: "Specialties" },
  { code: "21 00 00", name: "Fire Suppression" },
  { code: "22 00 00", name: "Plumbing" },
  { code: "23 00 00", name: "HVAC" },
  { code: "26 00 00", name: "Electrical" },
  { code: "31 00 00", name: "Earthwork" },
  { code: "32 00 00", name: "Exterior Improvements" },
];

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

  console.log("\nDemo logins (password for both): " + DEMO_PASSWORD);
  console.log("  EU (metric/EUR/de): demo-eu@cantero.dev");
  console.log("  US (imperial/USD/en): demo-us@cantero.dev");
}

/** Plausible, hand-picked cross rates (not live) — see ExchangeRateService for why there's no
 * live feed. USD_PER expresses each currency's value in USD; every directed pair is derived from
 * that single table so the rates are internally consistent (EUR->USD and USD->EUR truly invert). */
async function seedExchangeRates() {
  const USD_PER: Record<string, number> = { EUR: 1.08, USD: 1.0, GBP: 1.25, CHF: 1.15, CAD: 0.74 };
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

async function seedCompany(args: {
  companyName: string;
  ownerEmail: string;
  ownerName: string;
  country: string;
  unitSystem: "metric" | "imperial";
  currency: "EUR" | "USD" | "GBP" | "CHF" | "CAD";
  locale: "en" | "de" | "es";
  planId: string;
  materials: StarterMaterial[];
  rateItems: StarterRateItem[];
}) {
  const existing = await prisma.user.findUnique({ where: { email: args.ownerEmail } });
  if (existing) {
    console.log(`Skipping ${args.companyName} — ${args.ownerEmail} already exists`);
    return;
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

  const materialIdByCode = new Map<string, string>();
  for (const m of args.materials) {
    const created = await prisma.materialCatalogItem.create({
      data: { companyId: company.id, code: m.code, name: m.name, unit: m.unit, defaultUnitPrice: m.defaultUnitPrice },
    });
    materialIdByCode.set(m.code, created.id);
  }

  for (const ri of args.rateItems) {
    await prisma.rateCatalogItem.create({
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
  }

  await prisma.costCode.createMany({
    data: STARTER_COST_CODES.map((c) => ({ companyId: company.id, code: c.code, name: c.name })),
  });

  const client = await prisma.client.create({
    data: { companyId: company.id, name: "Nordwind Bau AG", email: "contact@example.com" },
  });

  await prisma.project.create({
    data: { companyId: company.id, name: "Sample Renovation Project", clientId: client.id },
  });

  console.log(
    `Seeded ${args.companyName}: ${args.materials.length} materials, ${args.rateItems.length} rate items, 1 client, 1 project`,
  );
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
