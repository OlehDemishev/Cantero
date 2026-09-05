-- CreateEnum
CREATE TYPE "MeetingActionItemStatus" AS ENUM ('open', 'done');

-- CreateEnum
CREATE TYPE "LongLeadItemStatus" AS ENUM ('tracking', 'ordered', 'in_fabrication', 'shipped', 'delivered');

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "attendees" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_action_items" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "MeetingActionItemStatus" NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolvedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "long_lead_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplierId" TEXT,
    "purchaseOrderId" TEXT,
    "status" "LongLeadItemStatus" NOT NULL DEFAULT 'tracking',
    "submittalApprovalDate" TIMESTAMP(3),
    "orderedDate" TIMESTAMP(3),
    "expectedDeliveryDate" TIMESTAMP(3),
    "actualDeliveryDate" TIMESTAMP(3),
    "requiredOnSiteDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "long_lead_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_code_budget_transfers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromCostCodeId" TEXT NOT NULL,
    "toCostCodeId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_code_budget_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meetings_companyId_idx" ON "meetings"("companyId");

-- CreateIndex
CREATE INDEX "meetings_projectId_idx" ON "meetings"("projectId");

-- CreateIndex
CREATE INDEX "meeting_action_items_meetingId_idx" ON "meeting_action_items"("meetingId");

-- CreateIndex
CREATE INDEX "long_lead_items_companyId_idx" ON "long_lead_items"("companyId");

-- CreateIndex
CREATE INDEX "long_lead_items_projectId_idx" ON "long_lead_items"("projectId");

-- CreateIndex
CREATE INDEX "cost_code_budget_transfers_companyId_idx" ON "cost_code_budget_transfers"("companyId");

-- CreateIndex
CREATE INDEX "cost_code_budget_transfers_projectId_idx" ON "cost_code_budget_transfers"("projectId");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "long_lead_items" ADD CONSTRAINT "long_lead_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "long_lead_items" ADD CONSTRAINT "long_lead_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "long_lead_items" ADD CONSTRAINT "long_lead_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "long_lead_items" ADD CONSTRAINT "long_lead_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_code_budget_transfers" ADD CONSTRAINT "cost_code_budget_transfers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_code_budget_transfers" ADD CONSTRAINT "cost_code_budget_transfers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_code_budget_transfers" ADD CONSTRAINT "cost_code_budget_transfers_fromCostCodeId_fkey" FOREIGN KEY ("fromCostCodeId") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_code_budget_transfers" ADD CONSTRAINT "cost_code_budget_transfers_toCostCodeId_fkey" FOREIGN KEY ("toCostCodeId") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

