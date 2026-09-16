-- CreateEnum
CREATE TYPE "DatevChartOfAccounts" AS ENUM ('skr03', 'skr04');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "datevDebitorNumber" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "datevChartOfAccounts" "DatevChartOfAccounts",
ADD COLUMN     "datevClientNumber" TEXT,
ADD COLUMN     "datevConsultantNumber" TEXT,
ADD COLUMN     "datevExpenseAccountSubcontractors" TEXT,
ADD COLUMN     "datevFiscalYearStartDay" INTEGER,
ADD COLUMN     "datevFiscalYearStartMonth" INTEGER,
ADD COLUMN     "datevPayablesAccount" TEXT,
ADD COLUMN     "datevReceivablesAccount" TEXT,
ADD COLUMN     "datevRevenueAccountExempt" TEXT,
ADD COLUMN     "datevRevenueAccountReduced" TEXT,
ADD COLUMN     "datevRevenueAccountStandard" TEXT,
ADD COLUMN     "datevSachkontenlaenge" INTEGER;

-- AlterTable
ALTER TABLE "subcontractors" ADD COLUMN     "datevKreditorNumber" TEXT;
