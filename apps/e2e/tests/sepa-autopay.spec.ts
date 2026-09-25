import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { apiUrl, databaseUrl, testProjectName } from "../fixtures";
import { api, createSentInvoice, login, stripeConnectWebhookSecret } from "../api";

/**
 * A SEPA/ACH autopay debit doesn't settle at charge time — Stripe reports it days later with a
 * `payment_intent.succeeded` webhook, and that event is the only thing that ever marks the
 * invoice paid. The debit runs on the company's own Stripe account (Stripe Connect), so the event
 * arrives on the Connect endpoint carrying that account's id. This drives the real endpoint with
 * events signed exactly the way Stripe signs them (HMAC-SHA256 over `timestamp.payload` with the
 * endpoint secret), covering signature verification, the raw-body plumbing, the account check,
 * metadata routing and redelivery dedup together.
 */
function signedDelivery(event: object, secret = stripeConnectWebhookSecret()) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return { payload, header: `t=${timestamp},v1=${signature}` };
}

function paymentIntentEvent(
  type: "payment_intent.succeeded" | "payment_intent.payment_failed",
  intentId: string,
  meta: Record<string, string>,
  amountCents: number,
  account: string,
) {
  return {
    id: `evt_e2e_${intentId}_${type}`,
    object: "event",
    type,
    account,
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: intentId,
        object: "payment_intent",
        amount: amountCents,
        currency: "eur",
        status: type === "payment_intent.succeeded" ? "succeeded" : "requires_payment_method",
        payment_method_types: ["sepa_debit"],
        metadata: meta,
        last_payment_error: type === "payment_intent.payment_failed" ? { message: "insufficient_funds" } : null,
      },
    },
  };
}

async function deliver(event: object, secret?: string) {
  const { payload, header } = signedDelivery(event, secret);
  return fetch(`${apiUrl()}/billing/connect-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": header },
    body: payload,
  });
}

test("a settled SEPA autopay debit marks the invoice paid exactly once, and a failed one leaves it open", async ({ page }) => {
  const token = await login();
  const { invoiceId, total } = await createSentInvoice(token, testProjectName());
  const { companyId } = await api<{ companyId: string }>("GET", `/invoices/${invoiceId}`, token);
  const meta = { kind: "autopay", companyId, invoiceId, method: "bank_transfer" };
  const intentId = `pi_e2e_${Date.now()}`;
  const amountCents = Math.round(total * 100);
  // The company finished Stripe onboarding (done here directly — the real one is Stripe-hosted).
  const account = `acct_e2e_${Date.now()}`;
  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  try {
    await db.query(`UPDATE companies SET "stripeAccountId" = $1, "stripeChargesEnabled" = true WHERE id = $2`, [account, companyId]);
  } finally {
    await db.end();
  }

  await test.step("a debit on another company's Stripe account naming this invoice changes nothing", async () => {
    const res = await deliver(paymentIntentEvent("payment_intent.succeeded", `${intentId}_forged`, meta, amountCents, "acct_someone_else"));
    expect(res.status).toBe(201);
    const invoice = await api<{ status: string; payments: unknown[] }>("GET", `/invoices/${invoiceId}`, token);
    expect(invoice.status).toBe("sent");
    expect(invoice.payments).toHaveLength(0);
  });

  await test.step("an event with a forged signature is refused and changes nothing", async () => {
    const res = await deliver(paymentIntentEvent("payment_intent.succeeded", intentId, meta, amountCents, account), "whsec_not_the_real_secret");
    expect(res.status).toBe(400);
    const invoice = await api<{ status: string; payments: unknown[] }>("GET", `/invoices/${invoiceId}`, token);
    expect(invoice.payments).toHaveLength(0);
  });

  await test.step("a failed debit leaves the invoice sent", async () => {
    const res = await deliver(paymentIntentEvent("payment_intent.payment_failed", `${intentId}_failed`, meta, amountCents, account));
    expect(res.status).toBe(201);
    const invoice = await api<{ status: string; payments: unknown[] }>("GET", `/invoices/${invoiceId}`, token);
    expect(invoice.status).toBe("sent");
    expect(invoice.payments).toHaveLength(0);
  });

  await test.step("the settled debit records one bank-transfer payment for the full amount", async () => {
    const res = await deliver(paymentIntentEvent("payment_intent.succeeded", intentId, meta, amountCents, account));
    expect(res.status).toBe(201);
    const invoice = await api<{ status: string; payments: { amount: string; method: string }[] }>("GET", `/invoices/${invoiceId}`, token);
    expect(invoice.status).toBe("paid");
    expect(invoice.payments).toHaveLength(1);
    expect(Number(invoice.payments[0].amount)).toBeCloseTo(total, 2);
    expect(invoice.payments[0].method).toBe("bank_transfer");
  });

  await test.step("Stripe redelivering the same event doesn't pay it twice", async () => {
    const res = await deliver(paymentIntentEvent("payment_intent.succeeded", intentId, meta, amountCents, account));
    expect(res.status).toBe(201);
    const invoice = await api<{ payments: unknown[] }>("GET", `/invoices/${invoiceId}`, token);
    expect(invoice.payments).toHaveLength(1);
  });

  await test.step("the office sees it as paid", async () => {
    await page.goto("/login");
    await page.evaluate((t) => localStorage.setItem("cantero_token", t), token);
    await page.goto(`/invoices/${invoiceId}`);
    await expect(page.locator("span", { hasText: /^Paid$/ })).toBeVisible();
  });
});
