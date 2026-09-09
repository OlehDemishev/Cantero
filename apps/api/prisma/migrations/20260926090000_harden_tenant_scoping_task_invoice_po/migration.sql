-- Tenant-isolation hardening (AUDIT-2026-09-07.md, "составные FK для связей внутри компании").
-- Closes 3 concrete gaps where the DB itself did nothing to stop a row referencing another
-- company's data: Task had no companyId at all, Invoice's project/client FKs and
-- PurchaseOrder's supplier FK were single-column, checked only in application code.
--
-- Every integrity check below is expected to find 0 offending rows in practice, since writes
-- have always gone through company-scoped service code — but this migration is the first time
-- it's actually verified at the DB level, so each check aborts loudly instead of assuming.

-- 1. Task.companyId: add nullable, backfill from Project, verify, then require it.
ALTER TABLE "tasks" ADD COLUMN "companyId" TEXT;

UPDATE "tasks" t
SET "companyId" = p."companyId"
FROM "projects" p
WHERE p.id = t."projectId";

DO $$
DECLARE orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM "tasks" WHERE "companyId" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % task row(s) reference a projectId with no matching project — cannot backfill companyId', orphan_count;
  END IF;
END $$;

ALTER TABLE "tasks" ALTER COLUMN "companyId" SET NOT NULL;

-- 2. Composite-FK targets: (id, companyId) must be unique on the referenced side.
CREATE UNIQUE INDEX "projects_id_companyId_key" ON "projects"("id", "companyId");
CREATE UNIQUE INDEX "clients_id_companyId_key" ON "clients"("id", "companyId");
CREATE UNIQUE INDEX "suppliers_id_companyId_key" ON "suppliers"("id", "companyId");

-- 3. Pre-flight integrity checks: abort if any existing row already has a cross-company
-- reference that the new composite FK would reject. Expected to find 0 rows.
DO $$
DECLARE bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM "invoices" i JOIN "projects" p ON p.id = i."projectId"
  WHERE p."companyId" != i."companyId";
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % invoice(s) reference a project belonging to a different company', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count
  FROM "invoices" i JOIN "clients" c ON c.id = i."clientId"
  WHERE c."companyId" != i."companyId";
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % invoice(s) reference a client belonging to a different company', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count
  FROM "purchase_orders" po JOIN "suppliers" s ON s.id = po."supplierId"
  WHERE s."companyId" != po."companyId";
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % purchase order(s) reference a supplier belonging to a different company', bad_count;
  END IF;
END $$;

-- 4. Swap single-column FKs for composite (companyId-inclusive) ones.
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_projectId_fkey";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_companyId_fkey"
  FOREIGN KEY ("projectId", "companyId") REFERENCES "projects"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "tasks_companyId_idx" ON "tasks"("companyId");

ALTER TABLE "invoices" DROP CONSTRAINT "invoices_projectId_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_projectId_companyId_fkey"
  FOREIGN KEY ("projectId", "companyId") REFERENCES "projects"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoices" DROP CONSTRAINT "invoices_clientId_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_companyId_fkey"
  FOREIGN KEY ("clientId", "companyId") REFERENCES "clients"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplierId_fkey";
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_companyId_fkey"
  FOREIGN KEY ("supplierId", "companyId") REFERENCES "suppliers"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
