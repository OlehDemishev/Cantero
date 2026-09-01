-- AlterTable
ALTER TABLE "change_orders" ADD COLUMN     "lastReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "changeOrderRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "nps_surveys" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER,
    "comment" TEXT,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "nps_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_sms_broadcasts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "message" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "sentByUserId" TEXT,
    "sentByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_sms_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nps_surveys_token_key" ON "nps_surveys"("token");

-- CreateIndex
CREATE INDEX "nps_surveys_companyId_idx" ON "nps_surveys"("companyId");

-- CreateIndex
CREATE INDEX "nps_surveys_projectId_idx" ON "nps_surveys"("projectId");

-- CreateIndex
CREATE INDEX "crew_sms_broadcasts_companyId_idx" ON "crew_sms_broadcasts"("companyId");

-- CreateIndex
CREATE INDEX "crew_sms_broadcasts_projectId_idx" ON "crew_sms_broadcasts"("projectId");

-- AddForeignKey
ALTER TABLE "nps_surveys" ADD CONSTRAINT "nps_surveys_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nps_surveys" ADD CONSTRAINT "nps_surveys_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_sms_broadcasts" ADD CONSTRAINT "crew_sms_broadcasts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_sms_broadcasts" ADD CONSTRAINT "crew_sms_broadcasts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

