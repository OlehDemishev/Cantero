-- CreateEnum
CREATE TYPE "ChecklistTemplateType" AS ENUM ('punch_list', 'rfi', 'safety_briefing');

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "ChecklistTemplateType" NOT NULL,
    "name" TEXT NOT NULL,
    "defaultSubject" TEXT,
    "defaultBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_template_items" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_templates_companyId_idx" ON "checklist_templates"("companyId");

-- CreateIndex
CREATE INDEX "checklist_template_items_templateId_idx" ON "checklist_template_items"("templateId");

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
