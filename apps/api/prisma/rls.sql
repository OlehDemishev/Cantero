-- Defense-in-depth Row-Level Security for multi-tenant isolation.
--
-- Primary tenant isolation is enforced in application code (every service scopes
-- queries by companyId from the JWT — see src/common/guards, src/*/**.service.ts).
-- This file adds a second, independent layer at the database level so a bug in
-- application-level scoping can't leak data across companies.
--
-- STATUS: policies defined here are NOT yet wired into the request lifecycle.
-- To enable them, PrismaService needs to run `SET LOCAL app.company_id = '<uuid>'`
-- inside a transaction at the start of each request (a Prisma Client extension
-- or interceptor) — that wiring is a follow-up, not yet implemented. Until then,
-- running this file makes every scoped table fail closed (zero rows) unless a
-- session variable is set, so do not apply it against a running app without
-- also completing the wiring above.
--
-- Apply with:
--   pnpm --filter api prisma db execute --file prisma/rls.sql --schema prisma/schema.prisma

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies', 'memberships', 'invites', 'subscriptions',
    'material_catalog_items', 'rate_catalog_items',
    'estimates', 'estimate_material_requirements',
    'warehouses', 'stock_movements', 'suppliers', 'purchase_orders',
    'projects', 'clients', 'invoices', 'workers', 'documents'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (
         %I = NULLIF(current_setting(''app.company_id'', true), '''')::uuid
       )',
      t,
      -- Prisma fields are not @map'd to snake_case, so the actual column is "companyId" (camelCase, quoted).
      CASE WHEN t = 'companies' THEN 'id' ELSE 'companyId' END
    );
  END LOOP;
END $$;
