-- CreateEnum
CREATE TYPE "ContractClaimType" AS ENUM ('delay', 'differing_conditions', 'scope_dispute', 'other');

-- CreateEnum
CREATE TYPE "ContractClaimStatus" AS ENUM ('notice_given', 'submitted', 'negotiating', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "JobPostingStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "CandidateStage" AS ENUM ('applied', 'screening', 'interviewing', 'offer', 'hired', 'rejected');

-- CreateEnum
CREATE TYPE "PerformanceReviewCycleStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "PerformanceRating" AS ENUM ('below_expectations', 'meets_expectations', 'exceeds_expectations');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "contract_claims" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ContractClaimType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "noticeDate" TIMESTAMP(3) NOT NULL,
    "requestedAmount" DECIMAL(14,2),
    "requestedDays" INTEGER,
    "status" "ContractClaimStatus" NOT NULL DEFAULT 'notice_given',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_claim_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_claim_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_campaigns" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "spend" DECIMAL(12,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_postings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "trade" TEXT,
    "location" TEXT,
    "description" TEXT,
    "status" "JobPostingStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "stage" "CandidateStage" NOT NULL DEFAULT 'applied',
    "hiredWorkerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "interviewerName" TEXT,
    "notes" TEXT,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_review_cycles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PerformanceReviewCycleStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_review_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "rating" "PerformanceRating",
    "strengths" TEXT,
    "improvementAreas" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_goals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_claims_companyId_idx" ON "contract_claims"("companyId");

-- CreateIndex
CREATE INDEX "contract_claims_projectId_idx" ON "contract_claims"("projectId");

-- CreateIndex
CREATE INDEX "contract_claim_events_companyId_idx" ON "contract_claim_events"("companyId");

-- CreateIndex
CREATE INDEX "contract_claim_events_claimId_idx" ON "contract_claim_events"("claimId");

-- CreateIndex
CREATE INDEX "marketing_campaigns_companyId_idx" ON "marketing_campaigns"("companyId");

-- CreateIndex
CREATE INDEX "job_postings_companyId_idx" ON "job_postings"("companyId");

-- CreateIndex
CREATE INDEX "candidates_companyId_idx" ON "candidates"("companyId");

-- CreateIndex
CREATE INDEX "candidates_jobPostingId_idx" ON "candidates"("jobPostingId");

-- CreateIndex
CREATE INDEX "interviews_companyId_idx" ON "interviews"("companyId");

-- CreateIndex
CREATE INDEX "interviews_candidateId_idx" ON "interviews"("candidateId");

-- CreateIndex
CREATE INDEX "performance_review_cycles_companyId_idx" ON "performance_review_cycles"("companyId");

-- CreateIndex
CREATE INDEX "performance_reviews_companyId_idx" ON "performance_reviews"("companyId");

-- CreateIndex
CREATE INDEX "performance_reviews_workerId_idx" ON "performance_reviews"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "performance_reviews_cycleId_workerId_key" ON "performance_reviews"("cycleId", "workerId");

-- CreateIndex
CREATE INDEX "performance_goals_companyId_idx" ON "performance_goals"("companyId");

-- CreateIndex
CREATE INDEX "performance_goals_workerId_idx" ON "performance_goals"("workerId");

-- CreateIndex
CREATE INDEX "clients_campaignId_idx" ON "clients"("campaignId");

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_claim_events" ADD CONSTRAINT "contract_claim_events_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "contract_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review_cycles" ADD CONSTRAINT "performance_review_cycles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "performance_review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

