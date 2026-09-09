-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "recurringBillingPeriod" TIMESTAMP(3),
ADD COLUMN     "lateFeeChargedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lastLateFeeAccrualAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "stripeCheckoutSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_recurringInvoiceId_recurringBillingPeriod_key" ON "invoices"("recurringInvoiceId", "recurringBillingPeriod");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripeCheckoutSessionId_key" ON "payments"("stripeCheckoutSessionId");
