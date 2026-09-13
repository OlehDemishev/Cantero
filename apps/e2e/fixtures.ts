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

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? "postgresql://baugeld:baugeld@localhost:5432/baugeld?schema=public";
}

export function apiUrl(): string {
  return process.env.E2E_API_URL ?? "http://localhost:4000/api";
}
