-- CreateEnum
CREATE TYPE "ClientActivityType" AS ENUM ('note', 'call', 'meeting', 'email');

-- CreateTable
CREATE TABLE "client_activities" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "ClientActivityType" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_reminders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_activities_companyId_idx" ON "client_activities"("companyId");

-- CreateIndex
CREATE INDEX "client_activities_clientId_idx" ON "client_activities"("clientId");

-- CreateIndex
CREATE INDEX "client_reminders_companyId_idx" ON "client_reminders"("companyId");

-- CreateIndex
CREATE INDEX "client_reminders_clientId_idx" ON "client_reminders"("clientId");

-- AddForeignKey
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_reminders" ADD CONSTRAINT "client_reminders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_reminders" ADD CONSTRAINT "client_reminders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
