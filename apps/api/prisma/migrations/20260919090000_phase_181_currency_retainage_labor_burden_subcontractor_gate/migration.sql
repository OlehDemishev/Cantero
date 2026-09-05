-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "benefitsBurdenPercent" DECIMAL(5,2),
ADD COLUMN     "otherBurdenPercent" DECIMAL(5,2),
ADD COLUMN     "payrollTaxBurdenPercent" DECIMAL(5,2),
ADD COLUMN     "requireSubcontractorPrequalification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subcontractorEmrThreshold" DECIMAL(4,2),
ADD COLUMN     "workersCompBurdenPercent" DECIMAL(5,2);

