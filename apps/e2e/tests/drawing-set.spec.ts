import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { apiUrl, testProjectName } from "../fixtures";
import { api, createProject, login } from "../api";

/**
 * The drawings path end to end: a multi-page PDF set goes in, sheet numbers are read from each
 * title block and reviewed, the references printed on one sheet open the other, and a sheet is
 * measured with a clicked length snapped to the drawing's own lines at its printed scale.
 *
 * files/drawing-set.pdf is the set drawingSetPdf() in apps/api/src/drawings/sheet-recognition.spec.ts
 * generates: A3 landscape pages A-101 (with "5/A-501" and "SEE S-201"), A-501 (pointing back to
 * A-101), a German EG-01 title block, and a blank page. Its title-block frame is a 300 × 160 pt
 * rectangle with its top-left corner at (860.55, 651.89) on every sheet.
 */
const SET = join(__dirname, "../files/drawing-set.pdf");
const PAGE_WIDTH = 1190.55;
const FRAME = { left: 860.55, top: 651.89, width: 300 };

async function openDocuments(page: Page, token: string, projectId: string) {
  await page.goto("/login");
  await page.evaluate((t) => localStorage.setItem("cantero_token", t), token);
  await page.goto(`/projects/${projectId}?tab=documents`);
}

/** Dark pixels on a canvas — proof pdf.js actually painted the drawing, not just its background. */
async function ink(canvas: Locator): Promise<number> {
  return canvas.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 160) n++;
    return n;
  });
}

test("a drawing set is split into reviewed sheets whose references link, and a sheet is measured to scale", async ({ page }) => {
  // Tall enough that the whole fitted sheet is inside the takeoff's scroll area (70vh), so the
  // frame corners near the bottom of the page can be clicked where they're drawn.
  await page.setViewportSize({ width: 1440, height: 1500 });
  const token = await login();
  const projectId = await createProject(token, testProjectName());
  await openDocuments(page, token, projectId);

  await test.step("uploading the set proposes a sheet per page for review", async () => {
    await page.locator('input[type="file"][accept="application/pdf"]').setInputFiles(SET);
    // Read in the background: the review appears once the set's status turns "ready".
    await expect(page.getByRole("heading", { name: "Review drawing-set.pdf" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("4 pages, 3 with a recognized sheet number")).toBeVisible();
    await expect(page.getByLabel("Sheet no., page 1")).toHaveValue("A-101");
    await expect(page.getByLabel("Title, page 1")).toHaveValue("GROUND FLOOR PLAN");
    await expect(page.getByLabel("Discipline, page 1")).toHaveValue("Architectural");
    await expect(page.getByLabel("Sheet no., page 3")).toHaveValue("EG-01");
    await expect(page.getByLabel("Title, page 3")).toHaveValue("Grundriss Erdgeschoss");
    // The blank page is left out rather than guessed at.
    await expect(page.getByLabel("Add page 4")).not.toBeChecked();
    await expect(page.getByText("No sheet number found")).toBeVisible();
  });

  await test.step("a duplicate number blocks the import until it's fixed", async () => {
    await page.getByLabel("Add page 4").check();
    await page.getByLabel("Sheet no., page 4").fill("a 101");
    await expect(page.getByText("Same number as another page")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Add 4 sheets" })).toBeDisabled();
    await page.getByLabel("Add page 4").uncheck();
  });

  await test.step("importing creates the three sheets", async () => {
    await page.getByRole("button", { name: "Add 3 sheets" }).click();
    await expect(page.getByText("Added 3 new sheets.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /A-101 — GROUND FLOOR PLAN/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /EG-01 — Grundriss Erdgeschoss/ })).toBeVisible();
  });

  await test.step("a reference printed on A-101 opens A-501, which lists A-101 as referencing it", async () => {
    await page.getByRole("link", { name: /A-101 — GROUND FLOOR PLAN/ }).click();
    await expect(page.getByRole("heading", { name: "A-101 — GROUND FLOOR PLAN" })).toBeVisible();
    // "see A-501" and the "5/A-501" callout; "SEE S-201" names a sheet that doesn't exist, so it isn't a link.
    await expect(page.getByRole("link", { name: "Open A-501" })).toHaveCount(2);
    await expect(page.getByRole("link", { name: /Open S-201/ })).toHaveCount(0);
    await page.getByRole("link", { name: "Open A-501" }).first().click();
    await expect(page.getByRole("heading", { name: "A-501 — WALL SECTIONS AND DETAILS" })).toBeVisible();
    await expect(page.getByText("Referenced from:")).toBeVisible();
    await expect(page.getByRole("link", { name: "A-101 — GROUND FLOOR PLAN (×2)" })).toBeVisible();
  });

  await test.step("the sheet opens in takeoff, painted from its vectors", async () => {
    await page.getByRole("button", { name: "Measure this sheet" }).click();
    await expect(page).toHaveURL(/tab=documents&takeoff=/);
    await expect(page.getByRole("button", { name: "A-501 WALL SECTIONS AND DETAILS" })).toBeVisible();
    const drawing = page.locator("canvas.bg-white");
    await expect.poll(() => ink(drawing), { timeout: 15_000 }).toBeGreaterThan(500);
    await expect(page.getByText(/\(4 points\)/)).toBeVisible();
  });

  await test.step("at the printed 1:100 scale, a length clicked near the frame's corners snaps to them exactly", async () => {
    await page.getByRole("button", { name: "Set scale to measure lengths and areas" }).click();
    await page.getByRole("button", { name: "Set scale", exact: true }).click();
    await page.getByRole("button", { name: "Draw length" }).click();

    const overlay = page.locator("canvas.bg-white + canvas");
    await overlay.scrollIntoViewIfNeeded();
    const box = (await overlay.boundingBox())!;
    const k = box.width / PAGE_WIDTH; // CSS px per PDF unit
    // A few pixels off each corner, the way a person clicks.
    for (const [ux, uy, dx, dy] of [
      [FRAME.left, FRAME.top, 4, -3],
      [FRAME.left + FRAME.width, FRAME.top, -3, 4],
    ]) {
      await page.mouse.move(box.x + ux * k + dx, box.y + uy * k + dy);
      await page.mouse.click(box.x + ux * k + dx, box.y + uy * k + dy);
    }
    await page.getByLabel("Label", { exact: true }).fill("Title block top edge");
    await page.getByRole("button", { name: "Finish" }).click();
    // 300 pt = 300/72 in of paper; at 1:100 that's 300/72 × 2.54 m = 10.583 m.
    await expect(page.getByText("10.58 m")).toBeVisible();

    const takeoffId = new URL(page.url()).searchParams.get("takeoff")!;
    const takeoff = await api<{ measurements: { value: string; points: { x: number; y: number }[] }[] }>("GET", `/takeoffs/${takeoffId}`, token);
    const [m] = takeoff.measurements;
    expect(Number(m.value)).toBeCloseTo(10.5833, 3);
    expect(m.points[0].x).toBeCloseTo(FRAME.left, 2);
    expect(m.points[0].y).toBeCloseTo(FRAME.top, 2);
    expect(m.points[1].x).toBeCloseTo(FRAME.left + FRAME.width, 2);
  });

  await test.step("counting needs no scale and numbers each item", async () => {
    await page.getByRole("button", { name: "Count", exact: true }).click();
    const overlay = page.locator("canvas.bg-white + canvas");
    const box = (await overlay.boundingBox())!;
    for (const [x, y] of [[80, 60], [160, 90], [240, 60]]) await page.mouse.click(box.x + x, box.y + y);
    await page.getByLabel("Label", { exact: true }).fill("Outlets");
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByText("3 pcs")).toBeVisible();
  });
});

interface SetState {
  id: string;
  status: "analyzing" | "ready" | "importing" | "imported" | "failed";
  pageCount: number;
  pagesRead: number;
  error: string | null;
}

async function uploadSet(token: string, projectId: string, name: string, bytes: Buffer): Promise<SetState> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), name);
  const res = await fetch(`${apiUrl()}/projects/${projectId}/drawing-sets`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  expect(res.status).toBe(201);
  return res.json();
}

async function settled(token: string, id: string): Promise<SetState> {
  let set = await api<SetState>("GET", `/drawing-sets/${id}`, token);
  await expect
    .poll(async () => (set = await api<SetState>("GET", `/drawing-sets/${id}`, token)).status, { timeout: 30_000 })
    .not.toBe("analyzing");
  return set;
}

test("a set is read in the background: the upload answers at once, the uploader is notified, and an unreadable PDF fails with a reason", async ({ page }) => {
  const token = await login();
  const projectId = await createProject(token, testProjectName());

  const uploaded = await uploadSet(token, projectId, "drawing-set.pdf", readFileSync(SET));
  expect(uploaded).toMatchObject({ status: "analyzing", pageCount: 0 });
  const ready = await settled(token, uploaded.id);
  expect(ready).toMatchObject({ status: "ready", pageCount: 4, pagesRead: 4, error: null });

  const broken = await uploadSet(token, projectId, "broken.pdf", Buffer.from("%PDF-1.7\nthis is not really a PDF\n"));
  expect(await settled(token, broken.id)).toMatchObject({ status: "failed", error: "unreadable" });

  // Both wait in the project's list of open sets, and in the uploader's notifications.
  const open = await api<SetState[]>("GET", `/projects/${projectId}/drawing-sets`, token);
  expect(open.map((s) => [s.id, s.status])).toEqual(expect.arrayContaining([[ready.id, "ready"], [broken.id, "failed"]]));
  const { notifications } = await api<{ notifications: { key: string; severity: string; link: string }[] }>("GET", "/notifications", token);
  expect(notifications.find((n) => n.key === `drawing_set:${ready.id}:ready`)).toMatchObject({ severity: "warning", link: `/projects/${projectId}?tab=documents&drawingSet=${ready.id}` });
  expect(notifications.find((n) => n.key === `drawing_set:${broken.id}:failed`)).toMatchObject({ severity: "critical" });

  // The notification's link opens the set: the unreadable one says why and can be discarded.
  await page.goto("/login");
  await page.evaluate((t) => localStorage.setItem("cantero_token", t), token);
  await page.goto(`/projects/${projectId}?tab=documents&drawingSet=${broken.id}`);
  await expect(page.getByText("This PDF couldn't be read — it may be damaged or password-protected.")).toBeVisible();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByRole("list", { name: "Drawing sets in progress" }).getByText("broken.pdf")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Drawing sets in progress" }).getByText("drawing-set.pdf")).toBeVisible();

  await api("DELETE", `/drawing-sets/${ready.id}`, token);
  const after = await api<{ notifications: { key: string }[] }>("GET", "/notifications", token);
  expect(after.notifications.filter((n) => n.key.startsWith(`drawing_set:${ready.id}`) || n.key.startsWith(`drawing_set:${broken.id}`))).toEqual([]);
});
