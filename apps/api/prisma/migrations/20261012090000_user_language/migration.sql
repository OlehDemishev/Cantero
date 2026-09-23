-- A person's own app language; null keeps following their company's.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" "Locale";
