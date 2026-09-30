-- External timestamps of the GoBD ledger's head (RFC 3161), so a recomputed chain no longer
-- matches what an outside Time Stamping Authority signed. See GobdLedgerAnchor in schema.prisma.
-- CreateTable
CREATE TABLE "gobd_ledger_anchors" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "tsaUrl" TEXT NOT NULL,
    "token" BYTEA NOT NULL,
    "timestampedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gobd_ledger_anchors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gobd_ledger_anchors_companyId_sequence_key" ON "gobd_ledger_anchors"("companyId", "sequence");

-- AddForeignKey
ALTER TABLE "gobd_ledger_anchors" ADD CONSTRAINT "gobd_ledger_anchors_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only, like the ledger it anchors — the same function as 20261015090000_gobd_retention,
-- now naming whichever table the refused change was aimed at.
CREATE OR REPLACE FUNCTION gobd_ledger_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (GoBD): % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER gobd_anchor_no_update_or_delete
  BEFORE UPDATE OR DELETE ON "gobd_ledger_anchors"
  FOR EACH ROW EXECUTE FUNCTION gobd_ledger_append_only();

CREATE TRIGGER gobd_anchor_no_truncate
  BEFORE TRUNCATE ON "gobd_ledger_anchors"
  FOR EACH STATEMENT EXECUTE FUNCTION gobd_ledger_append_only();
