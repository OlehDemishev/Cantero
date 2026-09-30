import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import { Client } from "pg";
import { apiUrl, databaseUrl, testProjectName } from "../fixtures";
import { api, createSentInvoice, login } from "../api";

/**
 * The GoBD ledger's head is timestamped by an outside Time Stamping Authority (RFC 3161), and the
 * token stands on its own: openssl verifies it against the entry's hash without this app. Needs a
 * real TSA (GOBD_TSA_URL on the API) — skipped where none is configured.
 */
test("the ledger's newest entry is timestamped by an outside authority, verifiable without the app", async () => {
  const token = await login();
  const { enabled } = await api<{ enabled: boolean }>("GET", "/company/gobd/anchors", token);
  test.skip(!enabled, "No timestamp authority configured on this API (GOBD_TSA_URL)");

  // Sending an invoice locks it, which adds a ledger entry the last timestamp doesn't cover yet.
  await createSentInvoice(token, testProjectName());
  await api("POST", "/company/gobd/anchors", token);

  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  let head: { sequence: number; hash: string };
  try {
    const { rows } = await db.query<{ sequence: number; hash: string }>(
      `SELECT e.sequence, e.hash FROM gobd_ledger_entries e
       JOIN memberships m ON m."companyId" = e."companyId"
       JOIN users u ON u.id = m."userId" AND u.email = 'demo-eu@cantero.dev'
       ORDER BY e.sequence DESC LIMIT 1`,
    );
    head = rows[0];
  } finally {
    await db.end();
  }

  const { anchors } = await api<{ anchors: { id: string; sequence: number }[] }>("GET", "/company/gobd/anchors", token);
  expect(anchors[0].sequence).toBe(head.sequence);

  const res = await fetch(`${apiUrl()}/company/gobd/anchors/${anchors[0].id}/token.tsr`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.headers.get("content-type")).toContain("application/timestamp-reply");
  const dir = mkdtempSync(join(tmpdir(), "gobd-anchor-"));
  writeFileSync(join(dir, "token.tsr"), Buffer.from(await res.arrayBuffer()));
  writeFileSync(join(dir, "head.bin"), Buffer.from(head.hash, "hex"));
  writeFileSync(join(dir, "roots.pem"), rootCertificates.join("\n"));
  const openssl = (data: string) =>
    execFileSync("openssl", ["ts", "-verify", "-data", join(dir, data), "-in", join(dir, "token.tsr"), "-token_in", "-CAfile", join(dir, "roots.pem")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  expect(openssl("head.bin")).toContain("Verification: OK");
  writeFileSync(join(dir, "other.bin"), Buffer.alloc(32));
  expect(() => openssl("other.bin")).toThrow();

  const verification = await api<{ valid: boolean; anchoring: { anchorCount: number; entriesSinceLast: number } }>("GET", "/company/gobd/verify", token);
  expect(verification.valid).toBe(true);
  expect(verification.anchoring.anchorCount).toBeGreaterThan(0);
  expect(verification.anchoring.entriesSinceLast).toBe(0);
});
