import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_EMAIL, DEMO_PASSWORD, apiUrl } from "./fixtures";

/** Direct API access for arranging test state. A spec drives the UI only for the part it actually
 * covers (a portal signature, an offline flush, an SSO sign-in); building the project/estimate/
 * invoice it needs by clicking through five pages first would make every spec as slow and as
 * fragile as critical-path.spec.ts, and a failure there would say nothing about the flow under test. */
export async function api<T = any>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(`${apiUrl()}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function login(email = DEMO_EMAIL, password = DEMO_PASSWORD): Promise<string> {
  const { accessToken } = await api<{ accessToken: string }>("POST", "/auth/login", null, { email, password });
  return accessToken;
}

export async function createProject(token: string, name: string): Promise<string> {
  const clients = await api<{ id: string; name: string }[]>("GET", "/clients", token);
  const client = clients.find((c) => c.name === "Nordwind Bau AG") ?? clients[0];
  if (!client) throw new Error("The seeded demo company has no client to bill");
  const project = await api<{ id: string }>("POST", "/projects", token, { name, clientId: client.id });
  return project.id;
}

/** An approved estimate with one priced line — the precondition for both sending it to the client
 * and generating an invoice from it. */
export async function createApprovedEstimate(token: string, projectId: string, name: string): Promise<string> {
  const catalog = await api<{ id: string }[] | { items: { id: string }[] }>("GET", "/estimates/rate-catalog", token);
  const item = (Array.isArray(catalog) ? catalog : catalog.items)[0];
  if (!item) throw new Error("The seeded demo company has no rate-catalog item to price a line with");
  const estimate = await api<{ id: string }>("POST", "/estimates", token, { projectId, name, laborRatePerHour: 50 });
  await api("POST", `/estimates/${estimate.id}/lines`, token, { rateCatalogItemId: item.id, quantity: 2 });
  await api("POST", `/estimates/${estimate.id}/approve`, token);
  return estimate.id;
}

export async function createSentInvoice(token: string, projectName: string): Promise<{ projectId: string; invoiceId: string; total: number }> {
  const projectId = await createProject(token, projectName);
  const estimateId = await createApprovedEstimate(token, projectId, `${projectName} estimate`);
  const invoice = await api<{ id: string }>("POST", "/invoices/from-estimate", token, { estimateId });
  const sent = await api<{ total: string }>("POST", `/invoices/${invoice.id}/send`, token);
  return { projectId, invoiceId: invoice.id, total: Number(sent.total) };
}

/** The API's own webhook secret, so a spec can sign events exactly the way Stripe does. Read from
 * E2E_STRIPE_WEBHOOK_SECRET, falling back to apps/api/.env for a local run. */
function apiEnvSecret(name: string): string {
  const fromEnv = process.env[`E2E_${name}`] ?? process.env[name];
  if (fromEnv) return fromEnv;
  const env = readFileSync(join(__dirname, "../api/.env"), "utf-8");
  const match = new RegExp(`^${name}="?([^"\\n]+)"?`, "m").exec(env);
  if (!match) throw new Error(`Set E2E_${name} (or ${name} in apps/api/.env)`);
  return match[1];
}

export function stripeWebhookSecret(): string {
  return apiEnvSecret("STRIPE_WEBHOOK_SECRET");
}

/** The Stripe Connect endpoint's secret — events on companies' own connected accounts. */
export function stripeConnectWebhookSecret(): string {
  return apiEnvSecret("STRIPE_CONNECT_WEBHOOK_SECRET");
}
