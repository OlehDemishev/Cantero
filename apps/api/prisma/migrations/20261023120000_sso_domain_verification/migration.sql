-- S10: an SSO domain only routes logins and provisions users once the company has proven it
-- controls the domain's DNS with a TXT record. ssoDomain becomes a plain claim (no longer unique,
-- so squatting a domain can't lock its real owner out); uniqueness moves to ssoVerifiedDomain.

-- DropIndex
DROP INDEX "companies_ssoDomain_key";

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "ssoDomainVerificationToken" TEXT,
ADD COLUMN     "ssoDomainVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "ssoVerifiedDomain" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "companies_ssoVerifiedDomain_key" ON "companies"("ssoVerifiedDomain");

-- Grandfather SSO domains configured before verification existed, so existing customers keep
-- signing in. ssoDomain was unique until now, so this can't collide.
UPDATE "companies"
SET "ssoVerifiedDomain" = "ssoDomain", "ssoDomainVerifiedAt" = CURRENT_TIMESTAMP
WHERE "ssoDomain" IS NOT NULL;
