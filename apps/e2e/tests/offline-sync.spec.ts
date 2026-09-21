import { test, expect, type Page } from "@playwright/test";
import { testProjectName } from "../fixtures";
import { api, createProject, login } from "../api";

/**
 * Field mode is used on sites with no signal: a write made offline must be kept, delivered once
 * connectivity returns, and delivered exactly once — including the nasty case where the first
 * attempt actually reached the server but its response was lost, which looks identical to
 * "offline" from the browser's side. The API is checked directly from the test process (unaffected
 * by the browser's offline switch), so "exactly once" is asserted against the database's view,
 * not the page's optimistic one.
 */
async function openFieldPunchTab(page: Page, token: string, projectId: string) {
  await page.goto("/login");
  await page.evaluate(
    ({ t, p }) => {
      localStorage.setItem("cantero_token", t);
      localStorage.setItem("cantero_field_project", p);
    },
    { t: token, p: projectId },
  );
  await page.goto("/field");
  await page.getByRole("button", { name: "Punch", exact: true }).click();
  await expect(page.getByRole("button", { name: "+ New item" })).toBeVisible();
}

async function createPunchItem(page: Page, title: string) {
  await page.getByLabel("Item", { exact: true }).fill(title);
  await page.getByRole("button", { name: "+ New item" }).click();
}

async function countOnServer(token: string, projectId: string, title: string): Promise<number> {
  const items = await api<{ title: string }[]>("GET", `/punch-list?projectId=${projectId}`, token);
  return items.filter((i) => i.title === title).length;
}

test("a punch item created offline syncs once when the connection returns", async ({ page, context }) => {
  const token = await login();
  const projectId = await createProject(token, testProjectName());
  const title = `Offline crack ${Date.now()}`;
  await openFieldPunchTab(page, token, projectId);

  await test.step("offline, the item is kept locally and nothing reaches the server", async () => {
    await context.setOffline(true);
    await expect(page.getByText("Offline — will sync automatically").first()).toBeVisible();
    await createPunchItem(page, title);
    await expect(page.getByText("Saved offline — will sync automatically")).toBeVisible();
    await expect(page.getByText("1 pending sync")).toBeVisible();
    expect(await countOnServer(token, projectId, title)).toBe(0);
  });

  await test.step("back online, the queue flushes on its own and the item exists exactly once", async () => {
    await context.setOffline(false);
    await expect(page.getByText("1 pending sync")).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(() => countOnServer(token, projectId, title)).toBe(1);
  });

  await test.step("a reload doesn't flush it a second time", async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Punch", exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await countOnServer(token, projectId, title)).toBe(1);
  });
});

test("a write whose response was lost is not duplicated when the queue retries it", async ({ page }) => {
  const token = await login();
  const projectId = await createProject(token, testProjectName());
  const title = `Lost response ${Date.now()}`;
  await openFieldPunchTab(page, token, projectId);

  let firstKey: string | undefined;
  await test.step("the request commits server-side, but the browser only sees a network failure", async () => {
    let intercepted = false;
    await page.route("**/api/punch-list", async (route) => {
      if (intercepted || route.request().method() !== "POST") return route.continue();
      intercepted = true;
      firstKey = await route.request().headerValue("idempotency-key") ?? undefined;
      await route.fetch(); // really delivered — the server commits the item
      await route.abort("failed"); // …but the response never makes it back
    });
    await createPunchItem(page, title);
    await expect(page.getByText("Saved offline — will sync automatically")).toBeVisible();
    expect(await countOnServer(token, projectId, title)).toBe(1);
    await page.unroute("**/api/punch-list");
  });

  await test.step("the queued retry carries the same Idempotency-Key, so the server doesn't create a second item", async () => {
    expect(firstKey).toBeTruthy();
    const retry = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/punch-list"));
    await page.reload(); // mount-time flush, the way a worker reopening the app would trigger it
    const retried = await retry;
    expect(await retried.headerValue("idempotency-key")).toBe(firstKey);
    expect((await retried.response())?.ok()).toBe(true);
    await expect(page.getByRole("button", { name: "Punch", exact: true })).toBeVisible();
    await expect(page.getByText("1 pending sync")).toHaveCount(0, { timeout: 15_000 });
    await page.waitForTimeout(1000);
    expect(await countOnServer(token, projectId, title)).toBe(1);
  });
});
