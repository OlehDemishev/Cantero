-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('draft', 'sent', 'signed', 'void');

-- CreateEnum
CREATE TYPE "ReferralRewardStatus" AS ENUM ('none', 'pending', 'paid');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "lastLeadFollowUpSentAt" TIMESTAMP(3),
ADD COLUMN     "leadFollowUpCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referralRewardAmount" DECIMAL(12,2),
ADD COLUMN     "referralRewardStatus" "ReferralRewardStatus" NOT NULL DEFAULT 'none';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "changeOrderApprovalThresholdAmount" DECIMAL(14,2),
ADD COLUMN     "changeOrderRequiredApprovalCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "estimateRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leadFollowUpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "lastReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "restrictedToMembers" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "change_order_approvals" (
    "id" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_order_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT,
    "subcontractorId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'draft',
    "clientAccessToken" TEXT,
    "sentAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signatureImageKey" TEXT,
    "signedIp" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_order_approvals_changeOrderId_idx" ON "change_order_approvals"("changeOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "change_order_approvals_changeOrderId_userId_key" ON "change_order_approvals"("changeOrderId", "userId");

-- CreateIndex
CREATE INDEX "project_members_companyId_idx" ON "project_members"("companyId");

-- CreateIndex
CREATE INDEX "project_members_projectId_idx" ON "project_members"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- CreateIndex
CREATE INDEX "contract_templates_companyId_idx" ON "contract_templates"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_clientAccessToken_key" ON "contracts"("clientAccessToken");

-- CreateIndex
CREATE INDEX "contracts_companyId_idx" ON "contracts"("companyId");

-- CreateIndex
CREATE INDEX "contracts_projectId_idx" ON "contracts"("projectId");

-- AddForeignKey
ALTER TABLE "change_order_approvals" ADD CONSTRAINT "change_order_approvals_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "change_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

