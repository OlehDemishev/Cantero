import { test, expect } from "@playwright/test";
import { apiUrl, testProjectName } from "../fixtures";
import { api, createProject, login } from "../api";

/**
 * Search by meaning end to end, with the embedding model the API really runs: records written in
 * one language are found by a query in another, only moments after they were filed (a search asks
 * for an indexing run instead of waiting for the next interval), and a daily log entry repeated day
 * after day shows up once, with a count, instead of filling the list.
 */
const WORK = "Waterproofing of the basement walls with bitumen membrane.";
const QUERY = "Abdichtung der Kellerwände mit Bitumenbahnen";

interface SemanticResult {
  type: string;
  id: string;
  projectId: string;
  title: string;
  sameTextCount: number;
}

test("a repeated daily log entry is found by meaning in another language and listed once", async ({ page }) => {
  // The first run loads the model (a few seconds) and embeds whatever else is new.
  test.setTimeout(120_000);
  const token = await login();
  // Local dev can run the API with the embedding model off (SEMANTIC_SEARCH_ENABLED=false) to save memory.
  const probe = await fetch(`${apiUrl()}/search/semantic?q=probe`, { headers: { Authorization: `Bearer ${token}` } });
  test.skip(probe.status === 400 && /turned off/.test(await probe.text()), "meaning-based search is turned off on this API (SEMANTIC_SEARCH_ENABLED=false)");
  const projectId = await createProject(token, testProjectName());
  for (const day of ["2026-03-02", "2026-03-03", "2026-03-04"]) {
    await api("POST", "/daily-logs", token, { projectId, date: `${day}T08:00:00.000Z`, workPerformed: WORK });
  }

  await test.step("the new entries are indexed within moments of someone searching", async () => {
    await expect
      .poll(
        async () => {
          const results = await api<SemanticResult[]>("GET", `/search/semantic?q=${encodeURIComponent(QUERY)}`, token);
          return results.filter((r) => r.projectId === projectId).map((r) => ({ type: r.type, title: r.title, sameTextCount: r.sameTextCount }));
        },
        { timeout: 90_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toEqual([{ type: "daily_log", title: WORK, sameTextCount: 2 }]);
  });

  await test.step("global search lists the three entries as one result with a count", async () => {
    await page.goto("/login");
    await page.evaluate((t) => localStorage.setItem("cantero_token", t), token);
    await page.goto(`/projects/${projectId}`);
    await page.getByPlaceholder("Search everything…").fill(QUERY);

    await expect(page.getByText("By meaning")).toBeVisible();
    const result = page.getByRole("button", { name: new RegExp(WORK.replace(/[.]/g, "\\.")) });
    await expect(result).toHaveCount(1);
    await expect(result).toContainText("and 2 more with the same text");
    await expect(result).toContainText("Daily log");
  });
});
