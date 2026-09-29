import { Client } from "pg";
import { TEST_RUN_PREFIX, databaseUrl } from "./fixtures";

/** Deleting a Project cascades to nearly everything a run created under it, Estimates included.
 * Invoices and expenses are the exception: they're kept for GoBD retention (onDelete: Restrict),
 * so a project with either can't be deleted until they're gone — hence removing them explicitly
 * first (an invoice's lines and payments go with it). Scoped by the "E2E Smoke " name prefix, so
 * this only ever touches rows this suite made itself, never the seeded demo data or another
 * engineer's manual testing. */
export default async function globalTeardown() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(`DELETE FROM invoices WHERE "projectId" IN (SELECT id FROM projects WHERE name LIKE $1)`, [`${TEST_RUN_PREFIX}%`]);
    await client.query(`DELETE FROM expenses WHERE "projectId" IN (SELECT id FROM projects WHERE name LIKE $1)`, [`${TEST_RUN_PREFIX}%`]);
    await client.query(`DELETE FROM projects WHERE name LIKE $1`, [`${TEST_RUN_PREFIX}%`]);
  } finally {
    await client.end();
  }
}
