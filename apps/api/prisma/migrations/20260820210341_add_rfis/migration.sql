-- CreateEnum
CREATE TYPE "RfiStatus" AS ENUM ('open', 'answered', 'closed');

-- CreateEnum
CREATE TYPE "RfiPriority" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "rfis" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "priority" "RfiPriority" NOT NULL DEFAULT 'medium',
    "status" "RfiStatus" NOT NULL DEFAULT 'open',
    "dueDate" TIMESTAMP(3),
    "costImpact" BOOLEAN NOT NULL DEFAULT false,
    "scheduleImpactDays" INTEGER,
    "askedByUserId" TEXT,
    "askedByName" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "answeredByUserId" TEXT,
    "answeredByName" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "closedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rfis_companyId_idx" ON "rfis"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "rfis_projectId_number_key" ON "rfis"("projectId", "number");

-- AddForeignKey
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
