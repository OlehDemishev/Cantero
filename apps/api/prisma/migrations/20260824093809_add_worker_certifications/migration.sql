-- CreateTable
CREATE TABLE "worker_certifications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worker_certifications_companyId_idx" ON "worker_certifications"("companyId");

-- CreateIndex
CREATE INDEX "worker_certifications_workerId_idx" ON "worker_certifications"("workerId");

-- AddForeignKey
ALTER TABLE "worker_certifications" ADD CONSTRAINT "worker_certifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_certifications" ADD CONSTRAINT "worker_certifications_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
