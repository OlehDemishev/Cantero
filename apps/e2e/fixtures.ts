import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Shared across global-setup, global-teardown, and the specs — kept in one place so the
 * "which company/user does this suite run against" answer only needs updating once. */

export const DEMO_EMAIL = "demo-eu@cantero.dev";
export const DEMO_PASSWORD = "cantero-demo-2026";

/** Every record this suite creates gets this name prefix, so global-teardown can delete
 * exactly (and only) what this run made — never touches the seeded demo data. */
export const TEST_RUN_PREFIX = "E2E Smoke";

export function testProjectName(): string {
  return `${TEST_RUN_PREFIX} ${Date.now()}`;
}

/** DATABASE_URL, falling back to the one apps/api/.env points the API at — the suite must set up
 * and clean up the same database the API under test is using. */
export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(__dirname, "../api/.env"), "utf-8");
  const match = /^DATABASE_URL="?([^"\n]+)"?/m.exec(env);
  if (!match) throw new Error("Set DATABASE_URL (or DATABASE_URL in apps/api/.env)");
  return match[1];
}

export function apiUrl(): string {
  return process.env.E2E_API_URL ?? "http://localhost:4000/api";
}
