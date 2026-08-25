-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('open', 'passed', 'failed');

-- CreateEnum
CREATE TYPE "InspectionItemResult" AS ENUM ('pending', 'pass', 'fail', 'na');

-- CreateEnum
CREATE TYPE "DeficiencySeverity" AS ENUM ('minor', 'major', 'critical');

-- CreateEnum
CREATE TYPE "DeficiencyStatus" AS ENUM ('open', 'resolved', 'verified');

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "expectedCloseDate" TIMESTAMP(3),
ADD COLUMN     "probability" INTEGER;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "deficiencyId" TEXT;

-- AlterTable
ALTER TABLE "resource_assignments" ADD COLUMN     "taskId" TEXT;

-- CreateTable
CREATE TABLE "client_stage_history" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromStage" "ClientStage",
    "toStage" "ClientStage" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_template_items" (
    "id" TEXT NOT NULL,
    "inspectionTemplateId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inspection_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_checklists" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "phase" TEXT,
    "status" "InspectionStatus" NOT NULL DEFAULT 'open',
    "inspectorWorkerId" TEXT,
    "inspectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_checklist_items" (
    "id" TEXT NOT NULL,
    "inspectionChecklistId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "result" "InspectionItemResult" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inspection_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deficiencies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "inspectionChecklistItemId" TEXT,
    "description" TEXT NOT NULL,
    "severity" "DeficiencySeverity" NOT NULL,
    "status" "DeficiencyStatus" NOT NULL DEFAULT 'open',
    "assigneeWorkerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "deficiencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_stage_history_companyId_idx" ON "client_stage_history"("companyId");

-- CreateIndex
CREATE INDEX "client_stage_history_clientId_idx" ON "client_stage_history"("clientId");

-- CreateIndex
CREATE INDEX "inspection_templates_companyId_idx" ON "inspection_templates"("companyId");

-- CreateIndex
CREATE INDEX "inspection_template_items_inspectionTemplateId_idx" ON "inspection_template_items"("inspectionTemplateId");

-- CreateIndex
CREATE INDEX "inspection_checklists_companyId_idx" ON "inspection_checklists"("companyId");

-- CreateIndex
CREATE INDEX "inspection_checklists_projectId_idx" ON "inspection_checklists"("projectId");

-- CreateIndex
CREATE INDEX "inspection_checklist_items_inspectionChecklistId_idx" ON "inspection_checklist_items"("inspectionChecklistId");

-- CreateIndex
CREATE INDEX "deficiencies_companyId_idx" ON "deficiencies"("companyId");

-- CreateIndex
CREATE INDEX "deficiencies_projectId_idx" ON "deficiencies"("projectId");

-- CreateIndex
CREATE INDEX "deficiencies_inspectionChecklistItemId_idx" ON "deficiencies"("inspectionChecklistItemId");

-- CreateIndex
CREATE INDEX "documents_deficiencyId_idx" ON "documents"("deficiencyId");

-- CreateIndex
CREATE INDEX "resource_assignments_taskId_idx" ON "resource_assignments"("taskId");

-- AddForeignKey
ALTER TABLE "client_stage_history" ADD CONSTRAINT "client_stage_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_stage_history" ADD CONSTRAINT "client_stage_history_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_deficiencyId_fkey" FOREIGN KEY ("deficiencyId") REFERENCES "deficiencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_template_items" ADD CONSTRAINT "inspection_template_items_inspectionTemplateId_fkey" FOREIGN KEY ("inspectionTemplateId") REFERENCES "inspection_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_checklists" ADD CONSTRAINT "inspection_checklists_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_checklists" ADD CONSTRAINT "inspection_checklists_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_checklists" ADD CONSTRAINT "inspection_checklists_inspectorWorkerId_fkey" FOREIGN KEY ("inspectorWorkerId") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_checklist_items" ADD CONSTRAINT "inspection_checklist_items_inspectionChecklistId_fkey" FOREIGN KEY ("inspectionChecklistId") REFERENCES "inspection_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deficiencies" ADD CONSTRAINT "deficiencies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deficiencies" ADD CONSTRAINT "deficiencies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deficiencies" ADD CONSTRAINT "deficiencies_inspectionChecklistItemId_fkey" FOREIGN KEY ("inspectionChecklistItemId") REFERENCES "inspection_checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deficiencies" ADD CONSTRAINT "deficiencies_assigneeWorkerId_fkey" FOREIGN KEY ("assigneeWorkerId") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

