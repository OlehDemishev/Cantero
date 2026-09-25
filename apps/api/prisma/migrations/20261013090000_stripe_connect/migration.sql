-- Stripe Connect: each company's clients pay into that company's own Stripe account.
-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "stripeAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "companies_stripeAccountId_key" ON "companies"("stripeAccountId");
