import { test, expect, type Page } from "@playwright/test";
import { testProjectName } from "../fixtures";
import { api, createApprovedEstimate, createProject, login } from "../api";

/**
 * The client side of an estimate: someone with no account opens the emailed link, signs on the
 * canvas and approves. Run in a fresh browser context with no Cantero token at all, so it proves
 * the public page works for a stranger — not just for a logged-in office user who happens to
 * open the link.
 */
async function drawSignature(page: Page) {
  const canvas = page.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(box.x + 20 + i * 15, box.y + box.height / 2 + (i % 2 ? -12 : 12));
  }
  await page.mouse.up();
}

test("a client approves an estimate by signing the public review link", async ({ browser }) => {
  const token = await login();
  const projectName = testProjectName();
  const projectId = await createProject(token, projectName);
  const estimateId = await createApprovedEstimate(token, projectId, `${projectName} estimate`);
  const { clientAccessToken } = await api<{ clientAccessToken: string }>("POST", `/estimates/${estimateId}/send`, token);

  const context = await browser.newContext();
  const page = await context.newPage();

  await test.step("the link opens without any account", async () => {
    await page.goto(`/estimate/${clientAccessToken}`);
    await expect(page.getByText(`${projectName} estimate`)).toBeVisible();
  });

  await test.step("approving without a signature is refused on the page", async () => {
    await page.getByPlaceholder("e.g. Jane Smith").fill("Erika Mustermann");
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText("Please type your name and draw your signature to approve.")).toBeVisible();
    const estimate = await api<{ clientDecision: string }>("GET", `/estimates/${estimateId}`, token);
    expect(estimate.clientDecision).toBe("pending");
  });

  await test.step("signing and approving records the decision with the signature", async () => {
    await drawSignature(page);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/public/estimates/${clientAccessToken}/decision`) && r.request().method() === "POST"),
      page.getByRole("button", { name: "Approve", exact: true }).click(),
    ]);
    expect(response.ok()).toBe(true);

    const estimate = await api<{ clientDecision: string; signerName: string | null; signatureImageKey: string | null }>("GET", `/estimates/${estimateId}`, token);
    expect(estimate.clientDecision).toBe("approved");
    expect(estimate.signerName).toBe("Erika Mustermann");
    expect(estimate.signatureImageKey).toBeTruthy();
  });

  await test.step("the stored signature is a real image of what was drawn", async () => {
    const res = await fetch(`${process.env.E2E_API_URL ?? "http://localhost:4000/api"}/estimates/${estimateId}/signature`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok).toBe(true);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // PNG magic
    expect(bytes.length).toBeGreaterThan(500); // not an empty canvas
  });

  await test.step("reopening the link shows the decision instead of the form again", async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  });

  await context.close();
});
