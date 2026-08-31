-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "vatId" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "city" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "vatId" TEXT;
