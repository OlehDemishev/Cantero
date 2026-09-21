import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ProjectAccessGuard finds the project on a route by name: `:projectId` anywhere, or `:id` right
 * after `projects/`. A project route that spells its param any other way (`:pid`, `:project`)
 * would skip the restricted-project check without anything failing — so this scans every
 * controller's full route paths and fails on that.
 */

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith(".controller.ts") ? [full] : [];
  });
}

function routePaths(source: string): string[] {
  const prefix = /@Controller\(\s*"([^"]*)"/.exec(source)?.[1] ?? "";
  const handlers = [...source.matchAll(/@(?:Get|Post|Put|Patch|Delete|All)\(\s*(?:"([^"]*)")?\s*\)/g)].map((m) => m[1] ?? "");
  return (handlers.length > 0 ? handlers : [""]).map((h) => [prefix, h].filter(Boolean).join("/"));
}

describe("project-scoped routes are visible to ProjectAccessGuard", () => {
  const routes = controllerFiles(join(__dirname, "../..")).flatMap((file) => routePaths(readFileSync(file, "utf8")).map((path) => ({ file, path })));

  it("finds the controllers (sanity check on the scan itself)", () => {
    expect(routes.filter((r) => /(^|\/)projects\/:id(\/|$)/.test(r.path)).length).toBeGreaterThan(50);
  });

  it("names the project param :id or :projectId right after projects/", () => {
    const offenders = routes.filter((r) => /(^|\/)projects\/:(?!id(\/|$)|projectId(\/|$))/.test(r.path));
    expect(offenders).toEqual([]);
  });
});
