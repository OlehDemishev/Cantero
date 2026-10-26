-- S5: the SAML ACS endpoint hands the browser a one-minute, single-use code bound to a nonce instead
-- of an access token in the URL. S6: a portal sign-out bumps portalTokenVersion, which retires every
-- portal token issued before it.

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "portalTokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "subcontractors" ADD COLUMN     "portalTokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "portalTokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sso_login_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_login_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sso_login_codes_codeHash_key" ON "sso_login_codes"("codeHash");

-- CreateIndex
CREATE INDEX "sso_login_codes_expiresAt_idx" ON "sso_login_codes"("expiresAt");

-- AddForeignKey
ALTER TABLE "sso_login_codes" ADD CONSTRAINT "sso_login_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_login_codes" ADD CONSTRAINT "sso_login_codes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

