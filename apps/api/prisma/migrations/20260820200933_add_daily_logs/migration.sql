-- CreateEnum
CREATE TYPE "WeatherCondition" AS ENUM ('clear', 'cloudy', 'rain', 'snow', 'extreme_heat', 'extreme_cold', 'other');

-- CreateTable
CREATE TABLE "daily_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "weatherCondition" "WeatherCondition",
    "weatherNotes" TEXT,
    "crewCount" INTEGER,
    "crewNotes" TEXT,
    "workPerformed" TEXT NOT NULL,
    "delays" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_logs_companyId_idx" ON "daily_logs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_logs_projectId_date_key" ON "daily_logs"("projectId", "date");

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
