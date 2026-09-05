-- CreateEnum
CREATE TYPE "BenefitPlanType" AS ENUM ('medical', 'dental', 'vision', 'life', 'disability', 'other');

-- CreateEnum
CREATE TYPE "BenefitEnrollmentStatus" AS ENUM ('active', 'waived', 'terminated');

-- CreateEnum
CREATE TYPE "WarrantyCoverageType" AS ENUM ('material', 'labor', 'both');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "taxJurisdictionId" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "safetyDataSheetId" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "taxJurisdictionId" TEXT;

-- CreateTable
CREATE TABLE "tax_jurisdictions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_jurisdictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "ratePercent" DECIMAL(6,3) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_exemption_certificates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_exemption_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_plans" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BenefitPlanType" NOT NULL,
    "carrier" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benefit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_plan_tiers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyEmployerCost" DECIMAL(10,2) NOT NULL,
    "monthlyEmployeeCost" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "benefit_plan_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_enrollments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "BenefitEnrollmentStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benefit_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_dependents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),

    CONSTRAINT "benefit_dependents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hazardous_materials" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "casNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hazardous_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_data_sheets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "hazardousMaterialId" TEXT NOT NULL,
    "version" TEXT,
    "revisionDate" TIMESTAMP(3),
    "hazardClassification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_data_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_hazmat_inventory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "hazardousMaterialId" TEXT NOT NULL,
    "quantity" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_hazmat_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_registrations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "manufacturer" TEXT,
    "coverageType" "WarrantyCoverageType" NOT NULL DEFAULT 'both',
    "termMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_jurisdictions_companyId_idx" ON "tax_jurisdictions"("companyId");

-- CreateIndex
CREATE INDEX "tax_rates_companyId_idx" ON "tax_rates"("companyId");

-- CreateIndex
CREATE INDEX "tax_rates_jurisdictionId_idx" ON "tax_rates"("jurisdictionId");

-- CreateIndex
CREATE INDEX "tax_exemption_certificates_companyId_idx" ON "tax_exemption_certificates"("companyId");

-- CreateIndex
CREATE INDEX "tax_exemption_certificates_clientId_idx" ON "tax_exemption_certificates"("clientId");

-- CreateIndex
CREATE INDEX "benefit_plans_companyId_idx" ON "benefit_plans"("companyId");

-- CreateIndex
CREATE INDEX "benefit_plan_tiers_companyId_idx" ON "benefit_plan_tiers"("companyId");

-- CreateIndex
CREATE INDEX "benefit_plan_tiers_planId_idx" ON "benefit_plan_tiers"("planId");

-- CreateIndex
CREATE INDEX "benefit_enrollments_companyId_idx" ON "benefit_enrollments"("companyId");

-- CreateIndex
CREATE INDEX "benefit_enrollments_workerId_idx" ON "benefit_enrollments"("workerId");

-- CreateIndex
CREATE INDEX "benefit_enrollments_planId_idx" ON "benefit_enrollments"("planId");

-- CreateIndex
CREATE INDEX "benefit_dependents_companyId_idx" ON "benefit_dependents"("companyId");

-- CreateIndex
CREATE INDEX "benefit_dependents_enrollmentId_idx" ON "benefit_dependents"("enrollmentId");

-- CreateIndex
CREATE INDEX "hazardous_materials_companyId_idx" ON "hazardous_materials"("companyId");

-- CreateIndex
CREATE INDEX "safety_data_sheets_companyId_idx" ON "safety_data_sheets"("companyId");

-- CreateIndex
CREATE INDEX "safety_data_sheets_hazardousMaterialId_idx" ON "safety_data_sheets"("hazardousMaterialId");

-- CreateIndex
CREATE INDEX "project_hazmat_inventory_companyId_idx" ON "project_hazmat_inventory"("companyId");

-- CreateIndex
CREATE INDEX "project_hazmat_inventory_projectId_idx" ON "project_hazmat_inventory"("projectId");

-- CreateIndex
CREATE INDEX "project_hazmat_inventory_hazardousMaterialId_idx" ON "project_hazmat_inventory"("hazardousMaterialId");

-- CreateIndex
CREATE INDEX "warranty_registrations_companyId_idx" ON "warranty_registrations"("companyId");

-- CreateIndex
CREATE INDEX "warranty_registrations_projectId_idx" ON "warranty_registrations"("projectId");

-- CreateIndex
CREATE INDEX "clients_taxJurisdictionId_idx" ON "clients"("taxJurisdictionId");

-- CreateIndex
CREATE INDEX "documents_safetyDataSheetId_idx" ON "documents"("safetyDataSheetId");

-- CreateIndex
CREATE INDEX "invoices_taxJurisdictionId_idx" ON "invoices"("taxJurisdictionId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_taxJurisdictionId_fkey" FOREIGN KEY ("taxJurisdictionId") REFERENCES "tax_jurisdictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_jurisdictions" ADD CONSTRAINT "tax_jurisdictions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "tax_jurisdictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_exemption_certificates" ADD CONSTRAINT "tax_exemption_certificates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_exemption_certificates" ADD CONSTRAINT "tax_exemption_certificates_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_taxJurisdictionId_fkey" FOREIGN KEY ("taxJurisdictionId") REFERENCES "tax_jurisdictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_plans" ADD CONSTRAINT "benefit_plans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_plan_tiers" ADD CONSTRAINT "benefit_plan_tiers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_plan_tiers" ADD CONSTRAINT "benefit_plan_tiers_planId_fkey" FOREIGN KEY ("planId") REFERENCES "benefit_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "benefit_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "benefit_plan_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_dependents" ADD CONSTRAINT "benefit_dependents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_dependents" ADD CONSTRAINT "benefit_dependents_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "benefit_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_safetyDataSheetId_fkey" FOREIGN KEY ("safetyDataSheetId") REFERENCES "safety_data_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hazardous_materials" ADD CONSTRAINT "hazardous_materials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_data_sheets" ADD CONSTRAINT "safety_data_sheets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_data_sheets" ADD CONSTRAINT "safety_data_sheets_hazardousMaterialId_fkey" FOREIGN KEY ("hazardousMaterialId") REFERENCES "hazardous_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_hazmat_inventory" ADD CONSTRAINT "project_hazmat_inventory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_hazmat_inventory" ADD CONSTRAINT "project_hazmat_inventory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_hazmat_inventory" ADD CONSTRAINT "project_hazmat_inventory_hazardousMaterialId_fkey" FOREIGN KEY ("hazardousMaterialId") REFERENCES "hazardous_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_registrations" ADD CONSTRAINT "warranty_registrations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_registrations" ADD CONSTRAINT "warranty_registrations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

