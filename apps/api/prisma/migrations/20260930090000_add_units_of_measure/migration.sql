-- AlterTable
ALTER TABLE "material_catalog_items" ADD COLUMN     "purchaseUnitId" TEXT,
ADD COLUMN     "unitId" TEXT;

-- CreateTable
CREATE TABLE "units_of_measure" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUnitId" TEXT,
    "factorToBase" DECIMAL(14,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "units_of_measure_companyId_idx" ON "units_of_measure"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "units_of_measure_companyId_code_key" ON "units_of_measure"("companyId", "code");

-- CreateIndex
CREATE INDEX "material_catalog_items_unitId_idx" ON "material_catalog_items"("unitId");

-- CreateIndex
CREATE INDEX "material_catalog_items_purchaseUnitId_idx" ON "material_catalog_items"("purchaseUnitId");

-- AddForeignKey
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_catalog_items" ADD CONSTRAINT "material_catalog_items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_catalog_items" ADD CONSTRAINT "material_catalog_items_purchaseUnitId_fkey" FOREIGN KEY ("purchaseUnitId") REFERENCES "units_of_measure"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- DataMigration: backfill UnitOfMeasure rows from the existing free-text `unit` column, one base
-- unit per distinct (companyId, trimmed/lowercased unit) pair so "kg" and " Kg " collapse into the
-- same row instead of becoming duplicate, unrelated units. `code`/`name` keep the first-seen
-- original casing/spacing (cosmetic only — matching is case/whitespace-insensitive).
WITH distinct_units AS (
  SELECT DISTINCT ON ("companyId", lower(trim(unit)))
    "companyId",
    lower(trim(unit)) AS unit_key,
    trim(unit) AS unit_label
  FROM material_catalog_items
  ORDER BY "companyId", lower(trim(unit)), "createdAt" ASC
),
inserted AS (
  INSERT INTO units_of_measure (id, "companyId", code, name, "createdAt")
  SELECT gen_random_uuid()::text, "companyId", unit_label, unit_label, now()
  FROM distinct_units
  RETURNING id, "companyId", code
)
UPDATE material_catalog_items m
SET "unitId" = i.id
FROM inserted i
WHERE i."companyId" = m."companyId" AND lower(i.code) = lower(trim(m.unit));

-- Integrity check: the NOT NULL constraint below would fail anyway, but this gives a clear,
-- named error instead of an opaque constraint-violation if the backfill above ever misses a row
-- (e.g. a unit string that is empty/whitespace-only, which trim() would turn into "").
DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT COUNT(*) INTO missing_count FROM material_catalog_items WHERE "unitId" IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'unit_of_measure backfill left % material_catalog_items with no unitId (likely an empty/whitespace-only unit string)', missing_count;
  END IF;
END $$;

-- AlterTable: unitId is now backfilled on every row — safe to require it going forward.
ALTER TABLE "material_catalog_items" ALTER COLUMN "unitId" SET NOT NULL;
