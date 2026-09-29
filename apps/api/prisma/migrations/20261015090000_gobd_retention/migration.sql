-- GoBD/HGB retention: invoices and vendor bills are kept 8–10 years, so deleting a company or a
-- project must fail while any of them exists instead of cascading them away. The GoBD ledger
-- outlives the account the same way.
-- DropForeignKey
ALTER TABLE "gobd_ledger_entries" DROP CONSTRAINT "gobd_ledger_entries_companyId_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_companyId_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_projectId_companyId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_bills" DROP CONSTRAINT "vendor_bills_companyId_fkey";

-- AddForeignKey
ALTER TABLE "gobd_ledger_entries" ADD CONSTRAINT "gobd_ledger_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_projectId_companyId_fkey" FOREIGN KEY ("projectId", "companyId") REFERENCES "projects"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The ledger is append-only for every role, the application's included: rows are only ever
-- INSERTed (GobdLedgerService.append), and a hash chain only proves tampering if nothing can
-- quietly rewrite or remove it. A plain REVOKE wouldn't hold here, since the application connects
-- as the table's owner.
CREATE FUNCTION gobd_ledger_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gobd_ledger_entries is append-only (GoBD): % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER gobd_ledger_no_update_or_delete
  BEFORE UPDATE OR DELETE ON "gobd_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION gobd_ledger_append_only();

CREATE TRIGGER gobd_ledger_no_truncate
  BEFORE TRUNCATE ON "gobd_ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION gobd_ledger_append_only();
