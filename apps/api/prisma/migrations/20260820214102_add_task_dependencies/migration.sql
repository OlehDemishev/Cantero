-- CreateEnum
CREATE TYPE "TaskDependencyType" AS ENUM ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish');

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" "TaskDependencyType" NOT NULL DEFAULT 'finish_to_start',
    "lagDays" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_predecessorId_successorId_key" ON "task_dependencies"("predecessorId", "successorId");

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
