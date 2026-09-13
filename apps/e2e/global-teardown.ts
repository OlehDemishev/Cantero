import { Client } from "pg";
import { TEST_RUN_PREFIX, databaseUrl } from "./fixtures";

/** Deleting the Project cascades to its Estimates and Invoices (and their lines/payments) per
 * schema.prisma's onDelete: Cascade on both relations — one DELETE is enough to remove everything
 * a run created. Scoped by the "E2E Smoke " name prefix, so this only ever touches rows this
 * suite made itself, never the seeded demo data or another engineer's manual testing. */
export default async function globalTeardown() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(`DELETE FROM projects WHERE name LIKE $1`, [`${TEST_RUN_PREFIX}%`]);
  } finally {
    await client.end();
  }
}
