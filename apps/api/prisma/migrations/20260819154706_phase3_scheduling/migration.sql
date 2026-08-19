-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startDate" TIMESTAMP(3);
