-- CreateEnum
CREATE TYPE "EmailDigestFrequency" AS ENUM ('off', 'daily', 'weekly');

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "emailDigestFrequency" "EmailDigestFrequency" NOT NULL DEFAULT 'off',
ADD COLUMN     "emailDigestLastSentAt" TIMESTAMP(3);
