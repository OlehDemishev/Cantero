import { Client } from "pg";
import { TEST_RUN_PREFIX, databaseUrl } from "./fixtures";

/** Deleting a Project cascades to nearly everything a run created under it, Estimates included.
 * Invoices are the exception: they're kept for GoBD retention (onDelete: Restrict), so a project
 * with invoices can't be deleted until they're gone — hence removing them explicitly first (their
 * lines and payments go with them). Scoped by the "E2E Smoke " name prefix, so this only ever
 * touches rows this suite made itself, never the seeded demo data or another engineer's manual
 * testing. */
export default async function globalTeardown() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(`DELETE FROM invoices WHERE "projectId" IN (SELECT id FROM projects WHERE name LIKE $1)`, [`${TEST_RUN_PREFIX}%`]);
    await client.query(`DELETE FROM projects WHERE name LIKE $1`, [`${TEST_RUN_PREFIX}%`]);
  } finally {
    await client.end();
  }
}
