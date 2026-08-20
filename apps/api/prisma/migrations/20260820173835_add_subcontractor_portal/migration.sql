-- CreateTable
CREATE TABLE "subcontractor_assignments" (
    "id" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcontractor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_portal_login_tokens" (
    "id" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcontractor_portal_login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subcontractor_assignments_subcontractorId_idx" ON "subcontractor_assignments"("subcontractorId");

-- CreateIndex
CREATE INDEX "subcontractor_assignments_projectId_idx" ON "subcontractor_assignments"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "subcontractor_assignments_subcontractorId_projectId_key" ON "subcontractor_assignments"("subcontractorId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "subcontractor_portal_login_tokens_token_key" ON "subcontractor_portal_login_tokens"("token");

-- CreateIndex
CREATE INDEX "subcontractor_portal_login_tokens_subcontractorId_idx" ON "subcontractor_portal_login_tokens"("subcontractorId");

-- AddForeignKey
ALTER TABLE "subcontractor_assignments" ADD CONSTRAINT "subcontractor_assignments_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_assignments" ADD CONSTRAINT "subcontractor_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_portal_login_tokens" ADD CONSTRAINT "subcontractor_portal_login_tokens_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
