-- CreateEnum
CREATE TYPE "HrCaseCategory" AS ENUM ('safety_violation', 'complaint', 'attendance', 'performance', 'harassment', 'other');

-- CreateEnum
CREATE TYPE "HrCaseSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "HrCaseStatus" AS ENUM ('open', 'investigating', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "HrCaseActionType" AS ENUM ('coaching', 'verbal_warning', 'written_warning', 'suspension', 'termination', 'note');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('active', 'paid_off', 'defaulted');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('truck', 'van', 'trailer', 'other');

-- CreateEnum
CREATE TYPE "VehicleInspectionResult" AS ENUM ('passed', 'failed');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed');

-- AlterTable
ALTER TABLE "workers" ADD COLUMN     "cdlExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "hr_cases" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "category" "HrCaseCategory" NOT NULL,
    "severity" "HrCaseSeverity" NOT NULL DEFAULT 'medium',
    "status" "HrCaseStatus" NOT NULL DEFAULT 'open',
    "description" TEXT NOT NULL,
    "confidential" BOOLEAN NOT NULL DEFAULT true,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_case_actions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "HrCaseActionType" NOT NULL,
    "description" TEXT NOT NULL,
    "actionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_case_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "lenderName" TEXT NOT NULL,
    "principal" DECIMAL(14,2) NOT NULL,
    "interestRatePercent" DECIMAL(5,2) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "principalPortion" DECIMAL(12,2) NOT NULL,
    "interestPortion" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vin" TEXT,
    "licensePlate" TEXT,
    "type" "VehicleType" NOT NULL DEFAULT 'truck',
    "assignedDriverId" TEXT,
    "registrationExpiresAt" TIMESTAMP(3),
    "insuranceExpiresAt" TIMESTAMP(3),
    "odometerMiles" DECIMAL(10,1),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_inspections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "VehicleInspectionResult" NOT NULL,
    "inspectorName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "responseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "requesterClientId" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT,
    "subject" TEXT NOT NULL,
    "category" TEXT,
    "priority" "TicketPriority" NOT NULL DEFAULT 'medium',
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "assignedToUserId" TEXT,
    "slaResponseDueAt" TIMESTAMP(3),
    "slaResolutionDueAt" TIMESTAMP(3),
    "firstRespondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorUserId" TEXT,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hr_cases_companyId_idx" ON "hr_cases"("companyId");

-- CreateIndex
CREATE INDEX "hr_cases_workerId_idx" ON "hr_cases"("workerId");

-- CreateIndex
CREATE INDEX "hr_case_actions_companyId_idx" ON "hr_case_actions"("companyId");

-- CreateIndex
CREATE INDEX "hr_case_actions_caseId_idx" ON "hr_case_actions"("caseId");

-- CreateIndex
CREATE INDEX "loans_companyId_idx" ON "loans"("companyId");

-- CreateIndex
CREATE INDEX "loan_payments_companyId_idx" ON "loan_payments"("companyId");

-- CreateIndex
CREATE INDEX "loan_payments_loanId_idx" ON "loan_payments"("loanId");

-- CreateIndex
CREATE INDEX "vehicles_companyId_idx" ON "vehicles"("companyId");

-- CreateIndex
CREATE INDEX "vehicles_assignedDriverId_idx" ON "vehicles"("assignedDriverId");

-- CreateIndex
CREATE INDEX "vehicle_inspections_companyId_idx" ON "vehicle_inspections"("companyId");

-- CreateIndex
CREATE INDEX "vehicle_inspections_vehicleId_idx" ON "vehicle_inspections"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "sla_policies_companyId_priority_key" ON "sla_policies"("companyId", "priority");

-- CreateIndex
CREATE INDEX "support_tickets_companyId_idx" ON "support_tickets"("companyId");

-- CreateIndex
CREATE INDEX "support_tickets_projectId_idx" ON "support_tickets"("projectId");

-- CreateIndex
CREATE INDEX "support_tickets_requesterClientId_idx" ON "support_tickets"("requesterClientId");

-- CreateIndex
CREATE INDEX "ticket_messages_companyId_idx" ON "ticket_messages"("companyId");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_idx" ON "ticket_messages"("ticketId");

-- AddForeignKey
ALTER TABLE "hr_cases" ADD CONSTRAINT "hr_cases_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_cases" ADD CONSTRAINT "hr_cases_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_case_actions" ADD CONSTRAINT "hr_case_actions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_case_actions" ADD CONSTRAINT "hr_case_actions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "hr_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_inspections" ADD CONSTRAINT "vehicle_inspections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_inspections" ADD CONSTRAINT "vehicle_inspections_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_requesterClientId_fkey" FOREIGN KEY ("requesterClientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

