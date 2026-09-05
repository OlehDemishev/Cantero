-- CreateEnum
CREATE TYPE "ClientChangeRequestStatus" AS ENUM ('submitted', 'under_review', 'converted', 'declined');

-- CreateEnum
CREATE TYPE "TaskCommitmentStatus" AS ENUM ('committed', 'completed', 'missed');

-- CreateEnum
CREATE TYPE "ObservationCategory" AS ENUM ('safe', 'at_risk');

-- CreateTable
CREATE TABLE "client_change_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "submittedByClientId" TEXT NOT NULL,
    "submittedByName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ClientChangeRequestStatus" NOT NULL DEFAULT 'submitted',
    "reviewNote" TEXT,
    "convertedChangeOrderId" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_commitments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "weekStarting" TIMESTAMP(3) NOT NULL,
    "status" "TaskCommitmentStatus" NOT NULL DEFAULT 'committed',
    "varianceReason" TEXT,
    "committedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "task_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_fuel_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "filledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" DECIMAL(10,2) NOT NULL,
    "cost" DECIMAL(12,2),
    "odometerMiles" DECIMAL(10,1),
    "idleHours" DECIMAL(6,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_fuel_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_observations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" "ObservationCategory" NOT NULL,
    "behaviorObserved" TEXT NOT NULL,
    "correctiveAction" TEXT,
    "observerUserId" TEXT,
    "observerName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_change_requests_convertedChangeOrderId_key" ON "client_change_requests"("convertedChangeOrderId");

-- CreateIndex
CREATE INDEX "client_change_requests_companyId_idx" ON "client_change_requests"("companyId");

-- CreateIndex
CREATE INDEX "client_change_requests_projectId_idx" ON "client_change_requests"("projectId");

-- CreateIndex
CREATE INDEX "client_change_requests_submittedByClientId_idx" ON "client_change_requests"("submittedByClientId");

-- CreateIndex
CREATE INDEX "task_commitments_companyId_idx" ON "task_commitments"("companyId");

-- CreateIndex
CREATE INDEX "task_commitments_taskId_idx" ON "task_commitments"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "task_commitments_taskId_weekStarting_key" ON "task_commitments"("taskId", "weekStarting");

-- CreateIndex
CREATE INDEX "vehicle_fuel_logs_companyId_idx" ON "vehicle_fuel_logs"("companyId");

-- CreateIndex
CREATE INDEX "vehicle_fuel_logs_vehicleId_idx" ON "vehicle_fuel_logs"("vehicleId");

-- CreateIndex
CREATE INDEX "safety_observations_companyId_idx" ON "safety_observations"("companyId");

-- CreateIndex
CREATE INDEX "safety_observations_projectId_idx" ON "safety_observations"("projectId");

-- AddForeignKey
ALTER TABLE "client_change_requests" ADD CONSTRAINT "client_change_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_change_requests" ADD CONSTRAINT "client_change_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_change_requests" ADD CONSTRAINT "client_change_requests_submittedByClientId_fkey" FOREIGN KEY ("submittedByClientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_change_requests" ADD CONSTRAINT "client_change_requests_convertedChangeOrderId_fkey" FOREIGN KEY ("convertedChangeOrderId") REFERENCES "change_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_commitments" ADD CONSTRAINT "task_commitments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_commitments" ADD CONSTRAINT "task_commitments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_fuel_logs" ADD CONSTRAINT "vehicle_fuel_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_fuel_logs" ADD CONSTRAINT "vehicle_fuel_logs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_observations" ADD CONSTRAINT "safety_observations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_observations" ADD CONSTRAINT "safety_observations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

