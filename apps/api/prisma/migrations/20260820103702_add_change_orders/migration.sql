-- CreateTable
CREATE TABLE "change_orders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "EstimateStatus" NOT NULL DEFAULT 'draft',
    "materialsCostTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "laborCostTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "markupAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "clientDecision" "EstimateClientDecision" NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "decisionAt" TIMESTAMP(3),
    "clientDecisionNote" TEXT,
    "clientAccessToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_order_lines" (
    "id" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "rateCatalogItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "materialsCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "change_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "change_orders_clientAccessToken_key" ON "change_orders"("clientAccessToken");

-- CreateIndex
CREATE INDEX "change_orders_companyId_idx" ON "change_orders"("companyId");

-- CreateIndex
CREATE INDEX "change_orders_estimateId_idx" ON "change_orders"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "change_orders_estimateId_number_key" ON "change_orders"("estimateId", "number");

-- CreateIndex
CREATE INDEX "change_order_lines_changeOrderId_idx" ON "change_order_lines"("changeOrderId");

-- AddForeignKey
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_order_lines" ADD CONSTRAINT "change_order_lines_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "change_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_order_lines" ADD CONSTRAINT "change_order_lines_rateCatalogItemId_fkey" FOREIGN KEY ("rateCatalogItemId") REFERENCES "rate_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
