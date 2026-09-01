-- AlterEnum
ALTER TYPE "EstimateClientDecision" ADD VALUE 'countered';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "enpsSurveysEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastEnpsSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "counterOfferAmount" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "site_sign_ins" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visitorCompany" TEXT,
    "purpose" TEXT,
    "signedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedOutAt" TIMESTAMP(3),

    CONSTRAINT "site_sign_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enps_surveys" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER,
    "comment" TEXT,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "enps_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_sign_ins_companyId_idx" ON "site_sign_ins"("companyId");

-- CreateIndex
CREATE INDEX "site_sign_ins_projectId_idx" ON "site_sign_ins"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "enps_surveys_token_key" ON "enps_surveys"("token");

-- CreateIndex
CREATE INDEX "enps_surveys_companyId_idx" ON "enps_surveys"("companyId");

-- CreateIndex
CREATE INDEX "enps_surveys_workerId_idx" ON "enps_surveys"("workerId");

-- AddForeignKey
ALTER TABLE "site_sign_ins" ADD CONSTRAINT "site_sign_ins_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_sign_ins" ADD CONSTRAINT "site_sign_ins_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enps_surveys" ADD CONSTRAINT "enps_surveys_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enps_surveys" ADD CONSTRAINT "enps_surveys_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

