-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "punchListSlaDays" INTEGER,
ADD COLUMN     "rfiSlaDays" INTEGER;

-- AlterTable
ALTER TABLE "punch_list_items" ADD COLUMN     "escalatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rfis" ADD COLUMN     "escalatedAt" TIMESTAMP(3);
