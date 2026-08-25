-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "customRoleId" TEXT;

-- CreateTable
CREATE TABLE "custom_roles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basePermissions" "MembershipRole"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_roles_companyId_idx" ON "custom_roles"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_roles_companyId_name_key" ON "custom_roles"("companyId", "name");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "custom_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

