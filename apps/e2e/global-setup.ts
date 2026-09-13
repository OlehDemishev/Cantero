import { Client } from "pg";
import { DEMO_EMAIL, databaseUrl } from "./fixtures";

/** This suite's selectors are English button/label text (e.g. "Approve estimate") — the demo
 * company's locale is a user-editable setting (see Settings → Company & Branding) that earlier
 * manual testing can leave on anything, so pin it to English before the run instead of chasing
 * flaky text-mismatch failures caused by whatever locale someone last clicked into. */
export default async function globalSetup() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      `UPDATE companies SET locale = 'en'
       WHERE id = (
         SELECT m."companyId" FROM memberships m
         JOIN users u ON u.id = m."userId"
         WHERE u.email = $1
         LIMIT 1
       )`,
      [DEMO_EMAIL],
    );
    if (rowCount === 0) {
      throw new Error(`No company found for ${DEMO_EMAIL} — has the database been seeded?`);
    }
  } finally {
    await client.end();
  }
}
