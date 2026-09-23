import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { OPEN, PUBLIC, RESTRICTED, covers } from "../../web/lib/route-access";

/**
 * Every page of the web app has a decision on who may open it (apps/web/lib/route-access.ts):
 * restricted to a permission, open to every member, or public. Without this a new page would be
 * reachable by URL for any member and show them empty panels — the gap the "no access" screen closes.
 */
function pages(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name.startsWith("(") ? pages(full, prefix) : pages(full, `${prefix}/${name}`);
    return name === "page.tsx" ? [prefix || "/"] : [];
  });
}

test("every web page is restricted, open to members, or public", () => {
  const all = pages(join(__dirname, "../../web/app"));
  expect(all.length).toBeGreaterThan(70);
  const lists = { restricted: Object.keys(RESTRICTED), open: OPEN, public: PUBLIC };
  const undecided: string[] = [];
  const ambiguous: string[] = [];
  for (const page of all) {
    const hits = Object.entries(lists).filter(([, entries]) => entries.some((e) => covers(e, page))).map(([name]) => name);
    if (hits.length === 0) undecided.push(page);
    // A page may be both open and restricted only when a more specific restricted entry exists
    // (e.g. "/team" open, "/team/*" restricted) — never open and public, or restricted and public.
    if (hits.includes("public") && hits.length > 1) ambiguous.push(`${page}: ${hits.join(" + ")}`);
  }
  expect(undecided).toEqual([]);
  expect(ambiguous).toEqual([]);
});
