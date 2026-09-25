import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { apiUrl, databaseUrl, testProjectName } from "../fixtures";
import { api, createProject, login } from "../api";

/**
 * A project restricted to its members stays closed to other employees even when they ask for one
 * of its records by the record's own id (`GET /rfis/:id`, `PATCH /tasks/:id`, ...) — the path
 * ProjectAccessGuard only covers through @ProjectResource. The same employee still reaches records
 * in an open project, and reaches the restricted ones once added as a member.
 */
const EMAIL_DOMAIN = "restricted-e2e.test";

let ownerToken: string;
let workerToken: string;
let workerUserId: string;
let restricted: { projectId: string; rfiId: string; punchId: string; taskId: string; logId: string; estimateId: string };
let openRfiId: string;

async function status(method: string, path: string, token: string, body?: unknown): Promise<number> {
  const res = await fetch(`${apiUrl()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.status;
}

async function projectWithRecords(token: string, name: string) {
  const projectId = await createProject(token, name);
  const rfi = await api<{ id: string }>("POST", "/rfis", token, { projectId, subject: "Door hardware", question: "Which lever set?" });
  const punch = await api<{ id: string }>("POST", "/punch-list", token, { projectId, title: "Scuffed wall in corridor" });
  const task = await api<{ id: string }>("POST", "/tasks", token, { projectId, name: "Drywall level 2" });
  const log = await api<{ id: string }>("POST", "/daily-logs", token, { projectId, date: "2026-03-02T08:00:00.000Z", workPerformed: "Drywall hanging." });
  const estimate = await api<{ id: string }>("POST", "/estimates", token, { projectId, name: "Interior works", laborRatePerHour: 50 });
  return { projectId, rfiId: rfi.id, punchId: punch.id, taskId: task.id, logId: log.id, estimateId: estimate.id };
}

test.beforeAll(async () => {
  ownerToken = await login();
  restricted = await projectWithRecords(ownerToken, `${testProjectName()} restricted`);
  await api("PATCH", `/projects/${restricted.projectId}/restricted`, ownerToken, { restrictedToMembers: true });
  const open = await projectWithRecords(ownerToken, `${testProjectName()} open`);
  openRfiId = open.rfiId;

  // A regular employee, invited and signed up the way a real one is.
  const email = `worker.${Date.now()}@${EMAIL_DOMAIN}`;
  await api("POST", "/company/invites", ownerToken, { email, role: "worker" });
  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  try {
    // Only the token's hash is stored and the raw one only goes out by email, so give the invite a
    // token this test knows.
    const inviteToken = `e2e-invite-${Date.now()}`;
    await db.query(`UPDATE invites SET token = encode(sha256(convert_to($1, 'UTF8')), 'hex') WHERE email = $2`, [inviteToken, email]);
    const accepted = await api<{ accessToken: string }>("POST", "/invites/accept", null, { token: inviteToken, name: "Site Worker", password: `pw-${Date.now()}-e2e` });
    workerToken = accepted.accessToken;
    workerUserId = (await db.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
  } finally {
    await db.end();
  }
});

test.afterAll(async () => {
  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  try {
    await db.query(`DELETE FROM invites WHERE email LIKE $1`, [`%@${EMAIL_DOMAIN}`]);
    await db.query(`DELETE FROM users WHERE email LIKE $1`, [`%@${EMAIL_DOMAIN}`]);
  } finally {
    await db.end();
  }
});

test("an employee outside a restricted project can't reach its records by id", async () => {
  const attempts: [string, string, unknown?][] = [
    ["GET", `/rfis/${restricted.rfiId}`],
    ["PATCH", `/rfis/${restricted.rfiId}`, { subject: "Changed" }],
    ["GET", `/punch-list/${restricted.punchId}`],
    ["PATCH", `/tasks/${restricted.taskId}`, { name: "Changed" }],
    ["GET", `/daily-logs/${restricted.logId}`],
    ["GET", `/estimates/${restricted.estimateId}`],
    ["GET", `/estimates/${restricted.estimateId}/pdf`],
    ["GET", `/custom-fields/project/${restricted.projectId}`],
  ];
  const results = [];
  for (const [method, path, body] of attempts) results.push(`${method} ${path.replace(/[0-9a-f-]{36}/g, ":id")} → ${await status(method, path, workerToken, body)}`);
  expect(results).toEqual(attempts.map(([method, path]) => `${method} ${path.replace(/[0-9a-f-]{36}/g, ":id")} → 403`));
});

test("the same employee reaches an open project's records, and a restricted one's once a member", async () => {
  expect(await status("GET", `/rfis/${openRfiId}`, workerToken)).toBe(200);

  await api("POST", `/projects/${restricted.projectId}/members`, ownerToken, { userId: workerUserId });
  expect(await status("GET", `/rfis/${restricted.rfiId}`, workerToken)).toBe(200);
  expect(await status("GET", `/daily-logs/${restricted.logId}`, workerToken)).toBe(200);
});
