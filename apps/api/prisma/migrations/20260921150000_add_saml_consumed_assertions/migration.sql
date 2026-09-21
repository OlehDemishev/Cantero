-- CreateTable
CREATE TABLE "saml_consumed_assertions" (
    "companyId" TEXT NOT NULL,
    "assertionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saml_consumed_assertions_pkey" PRIMARY KEY ("companyId","assertionId")
);

-- CreateIndex
CREATE INDEX "saml_consumed_assertions_expiresAt_idx" ON "saml_consumed_assertions"("expiresAt");

-- AddForeignKey
ALTER TABLE "saml_consumed_assertions" ADD CONSTRAINT "saml_consumed_assertions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

