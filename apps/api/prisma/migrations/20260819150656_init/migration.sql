-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'admin', 'estimator', 'foreman', 'accountant', 'worker');

-- CreateEnum
CREATE TYPE "UnitSystem" AS ENUM ('metric', 'imperial');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('EUR', 'USD', 'GBP', 'CHF', 'CAD');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'de', 'es');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('incomplete', 'active', 'past_due', 'canceled');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('draft', 'approved');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'void');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('receipt', 'issue', 'transfer', 'write_off');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('planned', 'in_progress', 'done');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitSystem" "UnitSystem" NOT NULL DEFAULT 'metric',
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "country" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'worker',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePerSeat" DECIMAL(10,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "stripePriceId" TEXT,
    "seatMinimum" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'incomplete',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_catalog_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "defaultUnitPrice" DECIMAL(12,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_catalog_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "laborHoursPerUnit" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_catalog_item_materials" (
    "id" TEXT NOT NULL,
    "rateCatalogItemId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT NOT NULL,
    "quantityPerUnit" DECIMAL(12,6) NOT NULL,
    "wasteFactorPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "rate_catalog_item_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'draft',
    "laborRatePerHour" DECIMAL(10,2) NOT NULL,
    "markupPercent" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "materialsCostTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "laborCostTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "markupAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_sections" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "estimate_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_lines" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "sectionId" TEXT,
    "rateCatalogItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "materialsCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "estimate_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_material_requirements" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "estimate_material_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT NOT NULL,
    "quantityOnHand" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "projectId" TEXT,
    "estimateLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateLineId" TEXT,
    "name" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'planned',
    "dueDate" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "estimateId" TEXT,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "hours" DECIMAL(6,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "invoiceId" TEXT,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_companyId_idx" ON "memberships"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_companyId_key" ON "memberships"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_companyId_idx" ON "invites"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_companyId_key" ON "subscriptions"("companyId");

-- CreateIndex
CREATE INDEX "material_catalog_items_companyId_idx" ON "material_catalog_items"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "material_catalog_items_companyId_code_key" ON "material_catalog_items"("companyId", "code");

-- CreateIndex
CREATE INDEX "rate_catalog_items_companyId_idx" ON "rate_catalog_items"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "rate_catalog_items_companyId_code_key" ON "rate_catalog_items"("companyId", "code");

-- CreateIndex
CREATE INDEX "rate_catalog_item_materials_rateCatalogItemId_idx" ON "rate_catalog_item_materials"("rateCatalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "rate_catalog_item_materials_rateCatalogItemId_materialCatal_key" ON "rate_catalog_item_materials"("rateCatalogItemId", "materialCatalogItemId");

-- CreateIndex
CREATE INDEX "estimates_companyId_idx" ON "estimates"("companyId");

-- CreateIndex
CREATE INDEX "estimates_projectId_idx" ON "estimates"("projectId");

-- CreateIndex
CREATE INDEX "estimate_sections_estimateId_idx" ON "estimate_sections"("estimateId");

-- CreateIndex
CREATE INDEX "estimate_lines_estimateId_idx" ON "estimate_lines"("estimateId");

-- CreateIndex
CREATE INDEX "estimate_material_requirements_estimateId_idx" ON "estimate_material_requirements"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_material_requirements_estimateId_materialCatalogIt_key" ON "estimate_material_requirements"("estimateId", "materialCatalogItemId");

-- CreateIndex
CREATE INDEX "warehouses_companyId_idx" ON "warehouses"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_warehouseId_materialCatalogItemId_key" ON "stock_levels"("warehouseId", "materialCatalogItemId");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_idx" ON "stock_movements"("companyId");

-- CreateIndex
CREATE INDEX "stock_movements_warehouseId_idx" ON "stock_movements"("warehouseId");

-- CreateIndex
CREATE INDEX "suppliers_companyId_idx" ON "suppliers"("companyId");

-- CreateIndex
CREATE INDEX "purchase_orders_companyId_idx" ON "purchase_orders"("companyId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_purchaseOrderId_idx" ON "purchase_order_lines"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "projects_companyId_idx" ON "projects"("companyId");

-- CreateIndex
CREATE INDEX "tasks_projectId_idx" ON "tasks"("projectId");

-- CreateIndex
CREATE INDEX "milestones_projectId_idx" ON "milestones"("projectId");

-- CreateIndex
CREATE INDEX "invoices_companyId_idx" ON "invoices"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_companyId_number_key" ON "invoices"("companyId", "number");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "clients_companyId_idx" ON "clients"("companyId");

-- CreateIndex
CREATE INDEX "workers_companyId_idx" ON "workers"("companyId");

-- CreateIndex
CREATE INDEX "time_entries_workerId_idx" ON "time_entries"("workerId");

-- CreateIndex
CREATE INDEX "time_entries_projectId_idx" ON "time_entries"("projectId");

-- CreateIndex
CREATE INDEX "documents_companyId_idx" ON "documents"("companyId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_catalog_items" ADD CONSTRAINT "material_catalog_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_catalog_items" ADD CONSTRAINT "rate_catalog_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_catalog_item_materials" ADD CONSTRAINT "rate_catalog_item_materials_rateCatalogItemId_fkey" FOREIGN KEY ("rateCatalogItemId") REFERENCES "rate_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_catalog_item_materials" ADD CONSTRAINT "rate_catalog_item_materials_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_sections" ADD CONSTRAINT "estimate_sections_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "estimate_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_rateCatalogItemId_fkey" FOREIGN KEY ("rateCatalogItemId") REFERENCES "rate_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_material_requirements" ADD CONSTRAINT "estimate_material_requirements_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_material_requirements" ADD CONSTRAINT "estimate_material_requirements_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_estimateLineId_fkey" FOREIGN KEY ("estimateLineId") REFERENCES "estimate_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_estimateLineId_fkey" FOREIGN KEY ("estimateLineId") REFERENCES "estimate_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
