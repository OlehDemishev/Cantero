-- CreateEnum
CREATE TYPE "OshaCaseType" AS ENUM ('injury', 'skin_disorder', 'respiratory_condition', 'poisoning', 'hearing_loss', 'all_other_illnesses');

-- AlterTable
ALTER TABLE "incident_reports" ADD COLUMN     "daysAwayFromWork" INTEGER,
ADD COLUMN     "daysJobTransferOrRestriction" INTEGER,
ADD COLUMN     "oshaCaseType" "OshaCaseType",
ADD COLUMN     "oshaRecordable" BOOLEAN NOT NULL DEFAULT false;
