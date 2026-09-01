-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'EUR';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'EUR';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "currency" "Currency";

-- Backfill: every existing estimate/invoice predates this column and was implicitly billed in
-- its own company's currency, not necessarily EUR (the column default) — set each row from its
-- owning company rather than leaving non-EUR companies' historical documents mislabeled.
UPDATE "estimates" e SET "currency" = c."currency" FROM "companies" c WHERE e."companyId" = c."id";
UPDATE "invoices" i SET "currency" = c."currency" FROM "companies" c WHERE i."companyId" = c."id";
