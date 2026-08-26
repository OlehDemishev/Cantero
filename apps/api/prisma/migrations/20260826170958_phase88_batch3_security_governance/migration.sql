-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "hideCostDataFromRoles" "MembershipRole"[] DEFAULT ARRAY[]::"MembershipRole"[],
ADD COLUMN     "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "passwordRequireSymbol" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sessionTimeoutMinutes" INTEGER;

