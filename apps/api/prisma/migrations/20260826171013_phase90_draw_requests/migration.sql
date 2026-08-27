-- CreateEnum
CREATE TYPE "DrawRequestStatus" AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'funded');

-- CreateTable
CREATE TABLE "draw_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "drawNumber" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "DrawRequestStatus" NOT NULL DEFAULT 'draft',
    "lenderName" TEXT,
    "lenderContactEmail" TEXT,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "fundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draw_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "draw_requests_invoiceId_key" ON "draw_requests"("invoiceId");

-- CreateIndex
CREATE INDEX "draw_requests_companyId_idx" ON "draw_requests"("companyId");

-- CreateIndex
CREATE INDEX "draw_requests_projectId_idx" ON "draw_requests"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "draw_requests_projectId_drawNumber_key" ON "draw_requests"("projectId", "drawNumber");

-- AddForeignKey
ALTER TABLE "draw_requests" ADD CONSTRAINT "draw_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_requests" ADD CONSTRAINT "draw_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_requests" ADD CONSTRAINT "draw_requests_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
