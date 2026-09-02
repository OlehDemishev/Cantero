-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('draft', 'sent', 'completed', 'voided');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "rfiId" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "supplierEta" TIMESTAMP(3),
ADD COLUMN     "supplierNote" TEXT;

-- CreateTable
CREATE TABLE "supplier_portal_login_tokens" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_portal_login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'draft',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_request_signers" (
    "id" TEXT NOT NULL,
    "signatureRequestId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signatureImageKey" TEXT,
    "signedIp" TEXT,

    CONSTRAINT "signature_request_signers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_portal_login_tokens_token_key" ON "supplier_portal_login_tokens"("token");

-- CreateIndex
CREATE INDEX "supplier_portal_login_tokens_supplierId_idx" ON "supplier_portal_login_tokens"("supplierId");

-- CreateIndex
CREATE INDEX "signature_requests_companyId_idx" ON "signature_requests"("companyId");

-- CreateIndex
CREATE INDEX "signature_requests_documentId_idx" ON "signature_requests"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "signature_request_signers_accessToken_key" ON "signature_request_signers"("accessToken");

-- CreateIndex
CREATE INDEX "signature_request_signers_signatureRequestId_idx" ON "signature_request_signers"("signatureRequestId");

-- CreateIndex
CREATE INDEX "documents_rfiId_idx" ON "documents"("rfiId");

-- AddForeignKey
ALTER TABLE "supplier_portal_login_tokens" ADD CONSTRAINT "supplier_portal_login_tokens_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_request_signers" ADD CONSTRAINT "signature_request_signers_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "signature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "rfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

