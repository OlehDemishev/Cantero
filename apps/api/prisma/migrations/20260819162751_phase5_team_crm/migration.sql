/*
  Warnings:

  - Added the required column `companyId` to the `time_entries` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ClientStage" AS ENUM ('lead', 'contacted', 'qualified', 'won', 'lost');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "stage" "ClientStage" NOT NULL DEFAULT 'lead';

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "companyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "workers" ADD COLUMN     "hourlyCost" DECIMAL(10,2);
