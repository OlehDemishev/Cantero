import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { apiUrl, databaseUrl, testProjectName } from "../fixtures";
import { api, createProject, login } from "../api";

/**
 * Approving an expense books it, so its receipt becomes a retained accounting record (GoBD): the
 * approval is locked in the ledger together with the receipt file's own hash, the receipt can't be
 * replaced afterwards, and the database won't let the expense go with its worker.
 */

async function uploadReceipt(token: string, expenseId: string, bytes: Buffer): Promise<number> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), "receipt.jpg");
  const res = await fetch(`${apiUrl()}/expenses/${expenseId}/receipt`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  return res.status;
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("an approved expense's receipt is locked by its hash, can't be swapped, and outlives its worker", async () => {
  const token = await login();
  const projectId = await createProject(token, testProjectName());
  const worker = await api<{ id: string }>("POST", "/workers", token, { name: `${testProjectName()} receipt worker` });
  const expense = await api<{ id: string }>("POST", "/expenses", token, {
    projectId,
    workerId: worker.id,
    category: "fuel",
    amount: 58.4,
    incurredAt: new Date().toISOString(),
    description: "Diesel for the excavator",
  });
  const blurry = Buffer.from(`blurry photo ${Date.now()}`);
  const sharp = Buffer.from(`sharp photo ${Date.now()}`);

  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  try {
    await test.step("while pending, the receipt can still be replaced", async () => {
      expect(await uploadReceipt(token, expense.id, blurry)).toBe(201);
      expect(await uploadReceipt(token, expense.id, sharp)).toBe(201);
    });

    await test.step("approval locks it in the GoBD ledger with the receipt's hash", async () => {
      await api("POST", `/expenses/${expense.id}/approve`, token);
      const { rows } = await db.query<{ payload: { amount: string; receipt: { sha256: string } | null } }>(
        `SELECT payload FROM gobd_ledger_entries WHERE "entityType" = 'Expense' AND "entityId" = $1 AND event = 'expense.locked'`,
        [expense.id],
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].payload.amount)).toBe(58.4);
      expect(rows[0].payload.receipt?.sha256).toBe(sha256(sharp));
      expect(await api<{ valid: boolean }>("GET", "/company/gobd/verify", token)).toMatchObject({ valid: true });
    });

    await test.step("afterwards the receipt can't be swapped, and the locked one is what comes back", async () => {
      expect(await uploadReceipt(token, expense.id, Buffer.from("a different receipt"))).toBe(400);
      const res = await fetch(`${apiUrl()}/expenses/${expense.id}/receipt`, { headers: { Authorization: `Bearer ${token}` } });
      expect(sha256(Buffer.from(await res.arrayBuffer()))).toBe(sha256(sharp));
    });

    await test.step("the database won't delete the expense along with its worker", async () => {
      await expect(db.query(`DELETE FROM workers WHERE id = $1`, [worker.id])).rejects.toThrow(/expenses_workerId_fkey/);
    });
  } finally {
    // Test data only: the ledger entry stays (it's append-only), the expense and worker go.
    await db.query(`DELETE FROM expenses WHERE id = $1`, [expense.id]);
    await db.query(`DELETE FROM workers WHERE id = $1`, [worker.id]);
    await db.end();
  }
});
