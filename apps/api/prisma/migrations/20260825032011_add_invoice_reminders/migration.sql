-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "invoiceRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "lastReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0;

