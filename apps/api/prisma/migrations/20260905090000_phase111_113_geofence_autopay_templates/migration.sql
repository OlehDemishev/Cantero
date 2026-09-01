-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripePaymentMethodBrand" TEXT,
ADD COLUMN     "stripePaymentMethodId" TEXT,
ADD COLUMN     "stripePaymentMethodLast4" TEXT;

-- AlterTable
ALTER TABLE "recurring_invoices" ADD COLUMN     "autopayEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_companyId_key_key" ON "message_templates"("companyId", "key");

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

