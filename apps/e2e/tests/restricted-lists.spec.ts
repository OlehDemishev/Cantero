import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { TEST_RUN_PREFIX, apiUrl, databaseUrl, testProjectName } from "../fixtures";
import { api, createApprovedEstimate, createProject, login } from "../api";
import { REPORT_PERMISSIONS } from "../../../packages/shared/src/report-access";
import { DEFAULT_GRANTS, type Permission } from "../../../packages/shared/src/permissions";

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
  // A failed run mustn't leave the demo company with changed permissions.
  await api("POST", "/company/permissions/reset", ownerToken, {}).catch(() => {});
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

/** The status a request gets, with nothing read from the body. */
async function statusOf(method: string, path: string, token: string, body?: unknown): Promise<number> {
  const res = await fetch(`${apiUrl()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  await res.arrayBuffer();
  return res.status;
}
const verdict = (status: number) => (status === 403 ? "refused" : status >= 500 ? `HTTP ${status}` : "allowed");
const setRole = (role: string) => api("PATCH", `/company/members/${employeeId}`, ownerToken, { role });
const setGrant = (role: string, permission: Permission, granted: boolean) => api("PATCH", "/company/permissions", ownerToken, { role, permission, granted });

test("each report answers the roles that hold its permission by default, and the web app shows what it answers", async ({ page }) => {
  test.setTimeout(180_000);
  const expected: string[] = [];
  const actual: string[] = [];
  for (const role of ROLES) {
    await setRole(role);
    for (const [report, permission] of Object.entries(REPORT_PERMISSIONS)) {
      expected.push(`${role} ${report} → ${(DEFAULT_GRANTS[role] as readonly string[]).includes(permission) ? "allowed" : "refused"}`);
      actual.push(`${role} ${report} → ${verdict(await statusOf("GET", `/reports/${report}`, employeeToken))}`);
    }
  }
  expect(actual).toEqual(expected);

  // The reports page leaves out what the member can't open instead of showing an empty panel.
  await page.goto("/login");
  await page.evaluate((t) => localStorage.setItem("cantero_token", t), employeeToken);
  await setRole("worker");
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Project margins" })).toHaveCount(0);
  await setRole("accountant");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Project margins" })).toBeVisible();
});

test("the role ladder: each route answers the roles whose default permissions cover it", async () => {
  test.setTimeout(180_000);
  // Nothing here changes data: guards run before validation, so an allowed role gets 400 for the empty
  // body or 404 for the made-up id, and a refused one gets 403.
  const none = "00000000-0000-4000-8000-000000000000";
  const checks: [Permission | "everyone", string, string, unknown?][] = [
    ["finance.view", "GET", "/invoices"],
    ["finance.export", "GET", "/invoices/export/datev.csv"],
    ["finance.manage", "POST", `/materials/vendor-bills/${none}/pay`, {}],
    ["finance.manage", "POST", `/finance/subcontractor-costs/${none}/mark-paid`, {}],
    ["finance.taxProfiles", "GET", `/finance/subcontractors/${none}/tax-profile`],
    ["finance.taxProfiles", "PATCH", `/finance/subcontractors/${none}/tax-profile`, {}],
    ["reports.custom", "GET", "/custom-reports"],
    ["finance.view", "GET", "/tax/jurisdictions"],
    ["costing.view", "GET", "/estimate-accuracy/rate-items"],
    ["costing.view", "GET", `/finance/budget-vs-actual?projectId=${none}`],
    ["hr.cases", "GET", "/hr-cases"],
    ["hr.cases", "GET", "/performance/cycles"],
    ["hr.payroll", "GET", "/benefits/plans"],
    ["hr.payroll", "GET", "/loans"],
    ["people.rates", "GET", "/team/labor-cost-report"],
    ["people.rates", "GET", `/workers/${none}/loaded-rate`],
    ["pricing.manage", "POST", "/markup-rules", {}],
    ["pricing.manage", "POST", "/cost-codes", {}],
    ["templates.field", "POST", "/checklist-templates", {}],
    ["templates.company", "POST", "/contract-templates", {}],
    ["subcontractors.view", "GET", "/finance/subcontractors"],
    ["estimates.view", "GET", "/estimates"],
    ["clients.view", "GET", "/clients"],
    ["contracts.view", "GET", "/contracts"],
    ["purchasing.view", "GET", "/materials/purchase-orders"],
    ["site.manage", "GET", "/meetings?projectId=" + none],
    ["site.manage", "POST", "/meetings", {}],
    ["site.dailyLogs.create", "POST", "/daily-logs", {}],
    ["projects.manage", "POST", "/projects", {}],
    ["settings.roles", "GET", "/company/permissions"],
    ["everyone", "GET", "/cost-codes"],
    ["everyone", "GET", "/projects"],
    ["everyone", "GET", "/materials/catalog"],
  ];
  const expected: string[] = [];
  const actual: string[] = [];
  for (const role of ROLES) {
    await setRole(role);
    for (const [permission, method, path, body] of checks) {
      const allowed = permission === "everyone" || (DEFAULT_GRANTS[role] as readonly string[]).includes(permission);
      expected.push(`${role} ${method} ${path} → ${allowed ? "allowed" : "refused"}`);
      actual.push(`${role} ${method} ${path} → ${verdict(await statusOf(method, path, employeeToken, body))}`);
    }
  }
  expect(actual).toEqual(expected);
});

test("an owner widens and narrows a role's permissions, and the API follows at once", async () => {
  await setRole("worker");
  expect(await statusOf("GET", "/invoices", employeeToken)).toBe(403);
  await setGrant("worker", "finance.view", true);
  expect(await statusOf("GET", "/invoices", employeeToken)).toBe(200);
  const me = await api<{ user: { permissions: string[] } }>("GET", "/me", employeeToken);
  expect(me.user.permissions).toContain("finance.view");
  // Back to the default: the override row is dropped.
  await setGrant("worker", "finance.view", false);
  expect(await statusOf("GET", "/invoices", employeeToken)).toBe(403);
  const matrix = await api<{ grants: { role: string; permission: string; granted: boolean; isDefault: boolean }[] }>("GET", "/company/permissions", ownerToken);
  expect(matrix.grants.find((g) => g.role === "worker" && g.permission === "finance.view")).toMatchObject({ granted: false, isDefault: true });

  // A foreman loses a default permission.
  await setRole("foreman");
  expect(await statusOf("POST", "/daily-logs", employeeToken, {})).toBe(400);
  await setGrant("foreman", "site.dailyLogs.create", false);
  expect(await statusOf("POST", "/daily-logs", employeeToken, {})).toBe(403);
  await api("POST", "/company/permissions/reset", ownerToken, { role: "foreman" });
  expect(await statusOf("POST", "/daily-logs", employeeToken, {})).toBe(400);

  // The owner's permissions can't be changed, and a non-manager can't touch the settings at all.
  await expect(setGrant("owner", "finance.view", false)).rejects.toThrow(/400/);
  expect(await statusOf("PATCH", "/company/permissions", employeeToken, { role: "worker", permission: "finance.view", granted: true })).toBe(403);
});

test("a worker sees and logs only their own hours and not colleagues' pay, while the site lead sees the crew", async () => {
  test.setTimeout(120_000);
  const projectId = await createProject(ownerToken, `${testProjectName()} crew time`);
  const own = await api<{ id: string }>("POST", "/workers", ownerToken, { name: `${testProjectName()} own` });
  const colleague = await api<{ id: string }>("POST", "/workers", ownerToken, { name: `${testProjectName()} colleague` });
  await api("PATCH", `/workers/${colleague.id}`, ownerToken, { hourlyCost: 55, phone: "+49 170 0000000" });
  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  try {
    await db.query(`UPDATE workers SET "userId" = $1 WHERE id = $2`, [employeeId, own.id]);
  } finally {
    await db.end();
  }
  const date = "2026-03-02T08:00:00.000Z";
  const colleagueEntry = await api<{ id: string }>("POST", "/time-entries", ownerToken, { projectId, workerId: colleague.id, hours: 5, date });

  await setRole("worker");
  expect(await statusOf("POST", "/time-entries", employeeToken, { projectId, workerId: colleague.id, hours: 2, date })).toBe(403);
  expect(await statusOf("POST", "/time-entries", employeeToken, { projectId, workerId: own.id, hours: 2, date })).toBe(201);
  expect(await statusOf("PATCH", `/time-entries/${colleagueEntry.id}`, employeeToken, { hours: 1 })).toBe(403);
  const mine = await api<{ workerId: string }[] | { items: { workerId: string }[] }>("GET", `/time-entries?projectId=${projectId}`, employeeToken);
  const rows = Array.isArray(mine) ? mine : mine.items;
  expect([...new Set(rows.map((r) => r.workerId))]).toEqual([own.id]);

  const asWorker = await api<Record<string, unknown>>("GET", `/workers/${colleague.id}`, employeeToken);
  expect(asWorker).toMatchObject({ id: colleague.id });
  expect(asWorker).not.toHaveProperty("hourlyCost");
  expect(asWorker).not.toHaveProperty("phone");

  await setRole("foreman");
  const crew = await api<{ workerId: string }[] | { items: { workerId: string }[] }>("GET", `/time-entries?projectId=${projectId}`, employeeToken);
  expect(new Set((Array.isArray(crew) ? crew : crew.items).map((r) => r.workerId))).toEqual(new Set([own.id, colleague.id]));
  const asForeman = await api<Record<string, unknown>>("GET", `/workers/${colleague.id}`, employeeToken);
  expect(asForeman.phone).toBe("+49 170 0000000");
  expect(asForeman).not.toHaveProperty("hourlyCost");

  await setRole("accountant");
  const asAccountant = await api<Record<string, unknown>>("GET", `/workers/${colleague.id}`, employeeToken);
  expect(Number(asAccountant.hourlyCost)).toBe(55);
});

test("with 'all projects' turned off, a worker sees only the projects they're on", async () => {
  test.setTimeout(120_000);
  const theirs = await createProject(ownerToken, `${testProjectName()} theirs`);
  const other = await createProject(ownerToken, `${testProjectName()} other`);
  const otherRfi = await api<{ id: string }>("POST", "/rfis", ownerToken, { projectId: other, subject: "Other site", question: "?" });
  await api("POST", `/projects/${theirs}/members`, ownerToken, { userId: employeeId });
  await setRole("worker");
  try {
    await setGrant("worker", "projects.all", false);
    const projects = await api<{ id: string }[]>("GET", "/projects", employeeToken);
    expect(projects.map((p) => p.id)).toContain(theirs);
    expect(projects.map((p) => p.id)).not.toContain(other);
    expect(await statusOf("GET", `/rfis/${otherRfi.id}`, employeeToken)).toBe(403);
    expect(await statusOf("GET", `/rfis?projectId=${other}`, employeeToken)).toBe(403);
    expect(await statusOf("GET", `/rfis?projectId=${theirs}`, employeeToken)).toBe(200);
  } finally {
    await setGrant("worker", "projects.all", true);
  }
  expect(await statusOf("GET", `/rfis/${otherRfi.id}`, employeeToken)).toBe(200);
});

test("Settings → Roles & permissions changes a role in the grid, and the web app hides what a role can't use", async ({ page }) => {
  test.setTimeout(120_000);
  const projectId = await createProject(ownerToken, `${testProjectName()} ui`);

  // The owner edits the grid.
  await page.goto("/login");
  await page.evaluate((t) => localStorage.setItem("cantero_token", t), ownerToken);
  await page.goto("/settings?tab=team");
  await expect(page.getByRole("heading", { name: "Roles & permissions" })).toBeVisible();
  const cell = page.getByRole("checkbox", { name: "See costs and budgets — Foreman" });
  await expect(cell).not.toBeChecked();
  await cell.check();
  await expect(cell).toBeChecked();
  const matrix = await api<{ grants: { role: string; permission: string; granted: boolean; isDefault: boolean }[] }>("GET", "/company/permissions", ownerToken);
  expect(matrix.grants.find((g) => g.role === "foreman" && g.permission === "costing.view")).toMatchObject({ granted: true, isDefault: false });
  await expect(page.getByRole("button", { name: "Reset Foreman" })).toBeVisible();
  await page.getByRole("button", { name: "Reset Foreman" }).click();
  await expect(cell).not.toBeChecked();
  // The owner's own column can't be switched off.
  await expect(page.getByRole("checkbox", { name: "See costs and budgets — Owner" })).toBeDisabled();

  // A worker's menu and project page leave out money.
  await setRole("worker");
  await page.evaluate((t) => localStorage.setItem("cantero_token", t), employeeToken);
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("link", { name: "Projects" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Invoices" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Financials" })).toHaveCount(0);
  await expect(page.getByText("Roles & permissions")).toHaveCount(0);

  // An accountant sees both.
  await setRole("accountant");
  await page.reload();
  await expect(page.getByRole("link", { name: "Invoices" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Financials" }).or(page.getByRole("tab", { name: "Financials" })).first()).toBeVisible();
});
