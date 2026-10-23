-- S8: a scheduled report runs as the member who created (or last changed) it, so its numbers leave
-- out the restricted projects that member can't see. Existing rows keep NULL: they run with every
-- restricted project left out until someone saves them again.

-- AlterTable
ALTER TABLE "scheduled_reports" ADD COLUMN     "createdById" TEXT;

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
