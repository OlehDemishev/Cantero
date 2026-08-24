-- CreateEnum
CREATE TYPE "BidRequestStatus" AS ENUM ('open', 'awarded', 'cancelled');

-- CreateTable
CREATE TABLE "bid_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "BidRequestStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bid_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid_invites" (
    "id" TEXT NOT NULL,
    "bidRequestId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bid_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" TEXT NOT NULL,
    "bidRequestId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "isAwarded" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bid_requests_companyId_idx" ON "bid_requests"("companyId");

-- CreateIndex
CREATE INDEX "bid_requests_projectId_idx" ON "bid_requests"("projectId");

-- CreateIndex
CREATE INDEX "bid_invites_subcontractorId_idx" ON "bid_invites"("subcontractorId");

-- CreateIndex
CREATE UNIQUE INDEX "bid_invites_bidRequestId_subcontractorId_key" ON "bid_invites"("bidRequestId", "subcontractorId");

-- CreateIndex
CREATE INDEX "bids_bidRequestId_idx" ON "bids"("bidRequestId");

-- CreateIndex
CREATE INDEX "bids_subcontractorId_idx" ON "bids"("subcontractorId");

-- CreateIndex
CREATE UNIQUE INDEX "bids_bidRequestId_subcontractorId_key" ON "bids"("bidRequestId", "subcontractorId");

-- AddForeignKey
ALTER TABLE "bid_requests" ADD CONSTRAINT "bid_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_requests" ADD CONSTRAINT "bid_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_invites" ADD CONSTRAINT "bid_invites_bidRequestId_fkey" FOREIGN KEY ("bidRequestId") REFERENCES "bid_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_invites" ADD CONSTRAINT "bid_invites_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidRequestId_fkey" FOREIGN KEY ("bidRequestId") REFERENCES "bid_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
