-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "peppolParticipantId" TEXT,
ADD COLUMN     "peppolScheme" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "peppolParticipantId" TEXT,
ADD COLUMN     "peppolScheme" TEXT;
