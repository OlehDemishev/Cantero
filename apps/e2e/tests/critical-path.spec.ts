import { test, expect, type Page, type Response } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD, apiUrl, testProjectName } from "../fixtures";

/**
 * The one path every dollar in this app flows through: sign in, stand up a project, price it,
 * bill it, get paid. If this breaks, the product doesn't work — regardless of what any unit test
 * says. Intentionally a single long test (not independent `test()` blocks) since each stage
 * depends on state the previous one created; `test.step` still gives per-stage timing/failure
 * output in the report.
 *
 * Each mutating click is paired with `waitForResponse` on the exact endpoint it fires, so a
 * failure points at "the API call itself failed/never fired" vs. "the UI didn't reflect it" —
 * a plain DOM assertion afterwards can't tell those apart.
 */
test("login → project → estimate → invoice → payment", async ({ page }) => {
  const projectName = testProjectName();

  await test.step("sign in", async () => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(DEMO_EMAIL);
    await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard");
  });

  await test.step("create a project", async () => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    const createForm = page.locator("form").filter({ has: page.getByPlaceholder("Name", { exact: true }) });
    await createForm.getByPlaceholder("Name", { exact: true }).fill(projectName);
    // Invoicing requires a client on the project — the seed data's own client covers that.
    await createForm.getByRole("combobox").selectOption({ label: "Nordwind Bau AG" });
    await clickAndWait(page, "POST", "/projects", () => createForm.getByRole("button", { name: "Create", exact: true }).click());

    const projectLink = page.getByRole("link", { name: new RegExp(projectName) });
    await expect(projectLink).toBeVisible();
    await projectLink.click();
    await page.waitForURL("**/projects/*");
  });

  await test.step("create an estimate with one priced line", async () => {
    // Labor rate / markup / tax fields already carry sane defaults — only the name is required.
    await page.getByPlaceholder("Name", { exact: true }).fill(`${projectName} estimate`);
    await clickAndWait(page, "POST", "/estimates", () => page.getByRole("button", { name: "Create", exact: true }).click());
    await page.waitForURL("**/estimates/*");

    // The rate-catalog item and quantity both default to a valid selection — just submit.
    await clickAndWait(page, "POST", "/lines", () => page.getByRole("button", { name: "Add line" }).click());
  });

  await test.step("approve the estimate and generate an invoice", async () => {
    await clickAndWait(page, "POST", "/approve", () => page.getByRole("button", { name: "Approve estimate" }).click());

    const generateInvoice = page.getByRole("button", { name: "Generate invoice" });
    await expect(generateInvoice).toBeVisible();
    await clickAndWait(page, "POST", "/invoices/from-estimate", () => generateInvoice.click());
    await page.waitForURL("**/invoices/*");
  });

  await test.step("send the invoice", async () => {
    await clickAndWait(page, "POST", "/send", () => page.getByRole("button", { name: "Send invoice" }).click());
    // The status badge, not the payments breakdown's "Sent"/"Paid" <dt> labels further down.
    await expect(page.locator("span", { hasText: /^Sent$/ })).toBeVisible();
  });

  await test.step("record full payment and confirm it settles", async () => {
    const total = await fetchInvoiceTotal(page);
    // Scoped to this form specifically — the invoice detail page also has an "Add installment"
    // form with its own "Amount" field.
    const paymentForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Record payment" }) });
    await paymentForm.getByPlaceholder("Amount", { exact: true }).fill(String(total));
    await clickAndWait(page, "POST", "/payments", () => paymentForm.getByRole("button", { name: "Record payment" }).click());
    await expect(page.locator("span", { hasText: /^Paid$/ })).toBeVisible();
  });
});

/** Clicks `act` and waits for the matching API call to come back successfully — races the click
 * against the response the same way `Promise.all` would, so there's no gap where the response
 * could arrive before we start waiting for it. */
async function clickAndWait(page: Page, method: string, urlContains: string, act: () => Promise<void>): Promise<Response> {
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.request().method() === method && res.url().includes(urlContains) && res.ok()),
    act(),
  ]);
  return response;
}

/** Reads the ground-truth invoice total via the API instead of parsing the page's formatted
 * currency string (locale-dependent thousands/decimal separators) — same bearer token the page
 * itself is using, pulled straight from localStorage. */
async function fetchInvoiceTotal(page: Page): Promise<number> {
  const invoiceId = new URL(page.url()).pathname.split("/").pop();
  const token = await page.evaluate(() => localStorage.getItem("cantero_token"));
  const total = await page.evaluate(
    async ({ base, id, bearer }) => {
      const res = await fetch(`${base}/invoices/${id}`, { headers: { Authorization: `Bearer ${bearer}` } });
      if (!res.ok) throw new Error(`GET /invoices/${id} → ${res.status}`);
      const invoice = await res.json();
      return invoice.total as string;
    },
    { base: apiUrl(), id: invoiceId, bearer: token },
  );
  return Number(total);
}
