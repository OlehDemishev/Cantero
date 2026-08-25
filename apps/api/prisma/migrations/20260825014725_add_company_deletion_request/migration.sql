-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedByUserId" TEXT;

