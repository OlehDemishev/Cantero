-- Configurable permissions: per-company changes to each role's default capabilities, and custom roles' extra ones.
-- AlterTable
ALTER TABLE "custom_roles" ADD COLUMN     "extraPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "role_permission_overrides" (
    "companyId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "role_permission_overrides_pkey" PRIMARY KEY ("companyId","role","permission")
);

-- AddForeignKey
ALTER TABLE "role_permission_overrides" ADD CONSTRAINT "role_permission_overrides_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

