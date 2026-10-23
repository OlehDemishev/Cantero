-- Which company a session's access token was issued for, so SCIM deactivation in one company
-- signs the person out of that company only. Null for sessions created before this migration.
-- AlterTable
ALTER TABLE "user_sessions" ADD COLUMN "companyId" TEXT;

-- CreateIndex
CREATE INDEX "user_sessions_userId_companyId_idx" ON "user_sessions"("userId", "companyId");
