-- CreateEnum
CREATE TYPE "FringeFundType" AS ENUM ('pension', 'health', 'training', 'vacation', 'other');

-- CreateEnum
CREATE TYPE "CommissioningSystemStatus" AS ENUM ('pending_testing', 'testing', 'complete');

-- CreateEnum
CREATE TYPE "FunctionalTestResult" AS ENUM ('pass', 'fail');

-- AlterTable
ALTER TABLE "wage_classifications" ADD COLUMN     "apprenticeRatio" TEXT;

-- AlterTable
ALTER TABLE "certified_payroll_reports" ADD COLUMN     "apprenticeRatioViolations" JSONB;

-- AlterTable
ALTER TABLE "workers" ADD COLUMN     "isApprentice" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "schedule_scenarios" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "schedule_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_scenario_task_overrides" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_scenario_task_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fringe_benefit_funds" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "wageClassificationId" TEXT NOT NULL,
    "fundType" "FringeFundType" NOT NULL,
    "name" TEXT NOT NULL,
    "ratePerHour" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fringe_benefit_funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_estimates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimatedPercentComplete" INTEGER NOT NULL,
    "matchedKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoCount" INTEGER NOT NULL,
    "billedPercentComplete" DECIMAL(5,2),
    "varianceFlagged" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissioning_systems" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "status" "CommissioningSystemStatus" NOT NULL DEFAULT 'pending_testing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commissioning_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissioning_checklist_items" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedByName" TEXT,

    CONSTRAINT "commissioning_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "functional_tests" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "procedure" TEXT NOT NULL,
    "result" "FunctionalTestResult" NOT NULL,
    "testedByName" TEXT NOT NULL,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "functional_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_training_sessions" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "trainerName" TEXT NOT NULL,
    "trainingDate" TIMESTAMP(3) NOT NULL,
    "attendeeNames" TEXT,
    "ownerSignedOffAt" TIMESTAMP(3),
    "ownerSignerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_scenarios_companyId_idx" ON "schedule_scenarios"("companyId");

-- CreateIndex
CREATE INDEX "schedule_scenarios_projectId_idx" ON "schedule_scenarios"("projectId");

-- CreateIndex
CREATE INDEX "schedule_scenario_task_overrides_scenarioId_idx" ON "schedule_scenario_task_overrides"("scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_scenario_task_overrides_scenarioId_taskId_key" ON "schedule_scenario_task_overrides"("scenarioId", "taskId");

-- CreateIndex
CREATE INDEX "fringe_benefit_funds_companyId_idx" ON "fringe_benefit_funds"("companyId");

-- CreateIndex
CREATE INDEX "fringe_benefit_funds_wageClassificationId_idx" ON "fringe_benefit_funds"("wageClassificationId");

-- CreateIndex
CREATE INDEX "progress_estimates_companyId_idx" ON "progress_estimates"("companyId");

-- CreateIndex
CREATE INDEX "progress_estimates_projectId_idx" ON "progress_estimates"("projectId");

-- CreateIndex
CREATE INDEX "commissioning_systems_companyId_idx" ON "commissioning_systems"("companyId");

-- CreateIndex
CREATE INDEX "commissioning_systems_projectId_idx" ON "commissioning_systems"("projectId");

-- CreateIndex
CREATE INDEX "commissioning_checklist_items_systemId_idx" ON "commissioning_checklist_items"("systemId");

-- CreateIndex
CREATE INDEX "functional_tests_systemId_idx" ON "functional_tests"("systemId");

-- CreateIndex
CREATE INDEX "owner_training_sessions_systemId_idx" ON "owner_training_sessions"("systemId");

-- AddForeignKey
ALTER TABLE "schedule_scenarios" ADD CONSTRAINT "schedule_scenarios_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_scenarios" ADD CONSTRAINT "schedule_scenarios_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_scenario_task_overrides" ADD CONSTRAINT "schedule_scenario_task_overrides_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "schedule_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_scenario_task_overrides" ADD CONSTRAINT "schedule_scenario_task_overrides_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fringe_benefit_funds" ADD CONSTRAINT "fringe_benefit_funds_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fringe_benefit_funds" ADD CONSTRAINT "fringe_benefit_funds_wageClassificationId_fkey" FOREIGN KEY ("wageClassificationId") REFERENCES "wage_classifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_estimates" ADD CONSTRAINT "progress_estimates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_estimates" ADD CONSTRAINT "progress_estimates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioning_systems" ADD CONSTRAINT "commissioning_systems_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioning_systems" ADD CONSTRAINT "commissioning_systems_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioning_checklist_items" ADD CONSTRAINT "commissioning_checklist_items_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "commissioning_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "functional_tests" ADD CONSTRAINT "functional_tests_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "commissioning_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_training_sessions" ADD CONSTRAINT "owner_training_sessions_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "commissioning_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

