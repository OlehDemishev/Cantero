-- CreateEnum
CREATE TYPE "SubmittalStatus" AS ENUM ('draft', 'submitted', 'approved', 'approved_as_noted', 'revise_and_resubmit', 'rejected');

-- CreateTable
CREATE TABLE "submittals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "rootSubmittalId" TEXT,
    "title" TEXT NOT NULL,
    "specSection" TEXT,
    "status" "SubmittalStatus" NOT NULL DEFAULT 'draft',
    "dueDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submittedByUserId" TEXT,
    "submittedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewedByName" TEXT,
    "reviewComments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submittals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submittals_projectId_idx" ON "submittals"("projectId");

-- CreateIndex
CREATE INDEX "submittals_companyId_idx" ON "submittals"("companyId");

-- CreateIndex
CREATE INDEX "submittals_rootSubmittalId_idx" ON "submittals"("rootSubmittalId");

-- AddForeignKey
ALTER TABLE "submittals" ADD CONSTRAINT "submittals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submittals" ADD CONSTRAINT "submittals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submittals" ADD CONSTRAINT "submittals_rootSubmittalId_fkey" FOREIGN KEY ("rootSubmittalId") REFERENCES "submittals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
