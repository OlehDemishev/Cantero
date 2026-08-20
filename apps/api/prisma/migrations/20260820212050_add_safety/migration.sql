-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('near_miss', 'first_aid', 'medical_treatment', 'lost_time_injury', 'fatality');

-- CreateTable
CREATE TABLE "incident_reports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "involvedPersons" TEXT,
    "correctiveActions" TEXT,
    "reportedByUserId" TEXT,
    "reportedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_briefings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "topic" TEXT NOT NULL,
    "notes" TEXT,
    "conductedByUserId" TEXT,
    "conductedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_briefings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_briefing_attendance" (
    "id" TEXT NOT NULL,
    "briefingId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,

    CONSTRAINT "safety_briefing_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_reports_projectId_idx" ON "incident_reports"("projectId");

-- CreateIndex
CREATE INDEX "incident_reports_companyId_idx" ON "incident_reports"("companyId");

-- CreateIndex
CREATE INDEX "safety_briefings_projectId_idx" ON "safety_briefings"("projectId");

-- CreateIndex
CREATE INDEX "safety_briefings_companyId_idx" ON "safety_briefings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "safety_briefing_attendance_briefingId_workerId_key" ON "safety_briefing_attendance"("briefingId", "workerId");

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_briefings" ADD CONSTRAINT "safety_briefings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_briefings" ADD CONSTRAINT "safety_briefings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_briefing_attendance" ADD CONSTRAINT "safety_briefing_attendance_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "safety_briefings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_briefing_attendance" ADD CONSTRAINT "safety_briefing_attendance_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
