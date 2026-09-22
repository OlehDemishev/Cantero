import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { TEST_RUN_PREFIX, apiUrl, databaseUrl, testProjectName } from "../fixtures";
import { api, createApprovedEstimate, createProject, login } from "../api";
import { REPORT_ROLES } from "../../../packages/shared/src/report-access";

/**
 * Company-wide lists, summaries and exports must leave out a restricted project an employee isn't a
 * member of. A restricted project is filled with one record of every kind this can create, each
 * carrying a unique marker; then, for every role short of owner/admin, every parameterless GET route
 * of the API is called and its response searched for the marker, the project's id and the records'
 * ids. Any hit is a leak. The same sweep then runs as the owner of a second, freshly signed-up
 * company, who must see nothing of the first company at all. Binary responses (PDF, images, zips) aren't searched; routes that answer
 * 4xx (a role that may not use them, a required query param) have nothing to leak.
 */
const EMAIL_DOMAIN = "restricted-lists-e2e.test";
const ROLES = ["estimator", "foreman", "accountant", "worker"] as const;
const MARKER = `RSTR${Date.now()}`;

let ownerToken: string;
/** One employee whose role is switched between passes: the demo company has few seats, and the API
 * re-reads the membership's role on every request, so each pass really runs as that role. */
let employeeToken: string;
let employeeId: string;
/** Owner of another company — sees every project of their own, and none of the demo company's. */
let outsiderToken: string;
const secrets: string[] = [MARKER];
const created: string[] = [];
const notCreated: string[] = [];

/** Parameterless GET routes, read from the API's controllers (the same scan as project-routes.spec.ts). */
function getRoutes(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : name.endsWith(".controller.ts") ? [full] : [];
    });
  const routes = new Set<string>();
  for (const file of walk(join(__dirname, "../../api/src"))) {
    const source = readFileSync(file, "utf8");
    if (/@Public\(\)\s*(@\w+\([^)]*\)\s*)*@Controller/.test(source)) continue;
    const prefix = /@Controller\(\s*"([^"]*)"/.exec(source)?.[1] ?? "";
    for (const m of source.matchAll(/@Get\(\s*(?:"([^"]*)")?\s*\)/g)) {
      const path = [prefix, m[1] ?? ""].filter(Boolean).join("/");
      if (!path.includes(":") && !/^(public|portal|subcontractor-portal|auth|health)(\/|$)/.test(path)) routes.add(path);
    }
  }
  return [...routes].sort();
}

async function make(kind: string, fn: () => Promise<{ id: string } | undefined>) {
  try {
    const row = await fn();
    if (row?.id) secrets.push(row.id);
    created.push(kind);
  } catch (err) {
    notCreated.push(`${kind}: ${(err as Error).message.slice(0, 120)}`);
  }
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  ownerToken = await login();
  const t = ownerToken;
  const projectId = await createProject(t, `${testProjectName()} ${MARKER}`);
  secrets.push(projectId);
  const post = <T = { id: string }>(path: string, body: unknown) => api<T>("POST", path, t, body);
  const at = "2026-03-02T08:00:00.000Z";
  // Named without the marker: workers are company-level and meant to show up everywhere.
  const worker = await post("/workers", { name: `${testProjectName()} crew member` });

  await make("rfi", () => post("/rfis", { projectId, subject: `${MARKER} rfi`, question: `${MARKER} question` }));
  await make("punch item", () => post("/punch-list", { projectId, title: `${MARKER} punch` }));
  await make("task", () => post("/tasks", { projectId, name: `${MARKER} task` }));
  await make("daily log", () => post("/daily-logs", { projectId, date: at, workPerformed: `${MARKER} log` }));
  await make("meeting", () => post("/meetings", { projectId, title: `${MARKER} meeting`, meetingDate: at }));
  await make("submittal", () => post("/submittals", { projectId, title: `${MARKER} submittal` }));
  await make("incident", () => post("/safety/incidents", { projectId, occurredAt: at, severity: "near_miss", description: `${MARKER} incident` }));
  await make("warranty claim", () => post("/warranty-claims", { projectId, title: `${MARKER} warranty` }));
  await make("safety briefing", () => post("/safety/briefings", { projectId, date: at, topic: `${MARKER} briefing` }));
  await make("job hazard analysis", () => post("/safety/jha", { projectId, date: at, taskDescription: `${MARKER} jha`, hazards: "Falls", controlMeasures: "Harness" }));
  await make("long-lead item", () => post("/long-lead-items", { projectId, description: `${MARKER} long lead` }));
  await make("contract", () => post("/contracts", { projectId, title: `${MARKER} contract`, body: `${MARKER} contract body` }));
  await make("time entry", () => post("/time-entries", { projectId, workerId: worker.id, hours: 3, date: at, notes: `${MARKER} time` }));
  await make("expense", () => post("/expenses", { projectId, workerId: worker.id, amount: 42, incurredAt: at, description: `${MARKER} expense` }));
  await make("estimate + invoice", async () => {
    const estimateId = await createApprovedEstimate(t, projectId, `${MARKER} estimate`);
    secrets.push(estimateId);
    return post("/invoices/from-estimate", { estimateId });
  });

  await api("PATCH", `/projects/${projectId}/restricted`, t, { restrictedToMembers: true });

  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  try {
    const email = `employee.${Date.now()}@${EMAIL_DOMAIN}`;
    await api("POST", "/company/invites", t, { email, role: "worker" });
    const { rows } = await db.query<{ token: string }>(`SELECT token FROM invites WHERE email = $1`, [email]);
    employeeToken = (await api<{ accessToken: string }>("POST", "/invites/accept", null, { token: rows[0].token, name: "Restricted Lists Employee", password: `pw-${Date.now()}-e2e` })).accessToken;
    employeeId = (await db.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    const outsider = await api<{ accessToken: string; companyId: string }>("POST", "/auth/signup", null, {
        companyName: `${TEST_RUN_PREFIX} other company ${Date.now()}`,
        name: "Other Owner",
        email: `outsider.${Date.now()}@${EMAIL_DOMAIN}`,
        password: `pw-${Date.now()}-e2e`,
        country: "DE",
        unitSystem: "metric",
        currency: "EUR",
        locale: "en",
        planCode: "pro",
      });
    outsiderToken = outsider.accessToken;
    // Stands in for completing checkout, which a fresh signup needs before anything else answers.
    await db.query(`UPDATE subscriptions SET status = 'active' WHERE "companyId" = $1`, [outsider.companyId]);
    // A project of its own, so project-scoped lists have something to answer with.
    await api("POST", "/clients", outsiderToken, { name: "Other Client" });
    await createProject(outsiderToken, `${testProjectName()} other company project`);
  } finally {
    await db.end();
  }
});

test.afterAll(async () => {
  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  try {
    await db.query(`DELETE FROM invites WHERE email LIKE $1`, [`%@${EMAIL_DOMAIN}`]);
    await db.query(`DELETE FROM companies WHERE name LIKE $1`, [`${TEST_RUN_PREFIX} other company %`]);
    await db.query(`DELETE FROM users WHERE email LIKE $1`, [`%@${EMAIL_DOMAIN}`]);
    await db.query(`DELETE FROM workers WHERE name LIKE $1`, [`${TEST_RUN_PREFIX}%`]);
  } finally {
    await db.end();
  }
});

test("company-wide lists leave out a restricted project the caller isn't on", async () => {
  test.setTimeout(300_000);
  test.info().annotations.push({ type: "restricted records", description: created.join(", ") });
  if (notCreated.length) test.info().annotations.push({ type: "not created", description: notCreated.join(" | ") });

  const routes = getRoutes();
  const leaks: string[] = [];
  let searched = 0;
  const sweep = async (who: string, token: string) => {
    for (const path of routes) {
      const res = await fetch(`${apiUrl()}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !/json|text|csv|xml|calendar/.test(type)) {
        await res.arrayBuffer();
        continue;
      }
      searched++;
      const body = await res.text();
      const found = secrets.filter((s) => body.includes(s));
      if (found.length) leaks.push(`${who.padEnd(14)} GET /${path}  (${found.includes(MARKER) ? "names" : "ids"})`);
    }
  };
  for (const role of ROLES) {
    await api("PATCH", `/company/members/${employeeId}`, ownerToken, { role });
    await sweep(role, employeeToken);
  }
  await sweep("other company", outsiderToken);
  test.info().annotations.push({ type: "searched", description: `${searched} responses over ${routes.length} routes × ${ROLES.length + 1} callers` });
  expect(created.length).toBeGreaterThan(10);
  expect(leaks).toEqual([]);
});

test("each report answers exactly the roles REPORT_ROLES names, and the web app shows what it answers", async ({ page }) => {
  test.setTimeout(180_000);
  const expected: string[] = [];
  const actual: string[] = [];
  for (const role of ROLES) {
    await api("PATCH", `/company/members/${employeeId}`, ownerToken, { role });
    for (const [report, roles] of Object.entries(REPORT_ROLES)) {
      const res = await fetch(`${apiUrl()}/reports/${report}`, { headers: { Authorization: `Bearer ${employeeToken}` } });
      await res.arrayBuffer();
      expected.push(`${role} ${report} → ${(roles as readonly string[]).includes(role) ? "allowed" : "refused"}`);
      actual.push(`${role} ${report} → ${res.status === 403 ? "refused" : res.ok ? "allowed" : `HTTP ${res.status}`}`);
    }
  }
  expect(actual).toEqual(expected);

  // The reports page leaves out what the role can't open instead of showing an empty panel.
  await page.goto("/login");
  await page.evaluate((t) => localStorage.setItem("cantero_token", t), employeeToken);
  await api("PATCH", `/company/members/${employeeId}`, ownerToken, { role: "worker" });
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Project margins" })).toHaveCount(0);
  await api("PATCH", `/company/members/${employeeId}`, ownerToken, { role: "accountant" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Project margins" })).toBeVisible();
});
