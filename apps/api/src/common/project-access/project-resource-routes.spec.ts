import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { projectResourcesOf, type ProjectResourceMeta } from "./project-resource.decorator";
import { projectPathFor } from "./project-path";

/**
 * Every internal route that takes an id in its path must say what that id points to:
 * @ProjectResource(model) when the row belongs to a project — ProjectAccessGuard then applies
 * Project.restrictedToMembers to it — or @NotProjectScoped(reason) when it doesn't. A route that says
 * neither would let a member read or change a restricted project's records by id without anyone
 * noticing, which is exactly what this test is for. Routes keyed by the project itself
 * (`projects/:id`, `:projectId`) and @Public() routes (portal and signed public links, which have
 * their own token checks) are left out.
 */

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith(".controller.ts") ? [full] : [];
  });
}

interface Route {
  controller: string;
  handler: string;
  path: string;
  onHandler: ProjectResourceMeta[];
  onClass: ProjectResourceMeta[];
}

function routesOf(file: string): Route[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const exports = require(file) as Record<string, unknown>;
  const routes: Route[] = [];
  for (const cls of Object.values(exports)) {
    if (typeof cls !== "function" || Reflect.getMetadata(PATH_METADATA, cls) === undefined) continue;
    const prefixes = [Reflect.getMetadata(PATH_METADATA, cls)].flat() as string[];
    const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, cls) === true;
    const onClass = projectResourcesOf(cls);
    for (const name of Object.getOwnPropertyNames(cls.prototype)) {
      const handler = cls.prototype[name];
      if (name === "constructor" || typeof handler !== "function" || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
      if (classPublic || Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true) continue;
      const onHandler = projectResourcesOf(handler);
      for (const prefix of prefixes)
        for (const sub of [Reflect.getMetadata(PATH_METADATA, handler) ?? ""].flat() as string[]) {
          const path = [prefix, sub].map((p) => p.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
          routes.push({ controller: cls.name, handler: name, path, onHandler, onClass });
        }
    }
  }
  return routes;
}

const PROJECT_KEYED = /(^|\/)projects\/:id(\/|$)|:projectId\b/;
const params = (path: string) => [...path.matchAll(/:(\w+)/g)].map((m) => m[1]);

describe("id-keyed routes declare whether they point into a project", () => {
  const routes = controllerFiles(join(__dirname, "../..")).flatMap(routesOf);
  const idKeyed = routes.filter((r) => params(r.path).length > 0 && !PROJECT_KEYED.test(r.path));
  const show = (r: Route) => `${r.controller}.${r.handler}  ${r.path}`;

  it("finds the routes (sanity check on the scan itself)", () => {
    expect(routes.length).toBeGreaterThan(900);
    expect(idKeyed.length).toBeGreaterThan(300);
  });

  /** What applies to a route: everything on its handler, and whatever on its controller names a
   * param this route has (or opts the whole controller out). */
  const applicable = (r: Route) => [...r.onHandler, ...r.onClass.filter((m) => "exempt" in m || params(r.path).includes(m.param))];

  it("every one has @ProjectResource or @NotProjectScoped", () => {
    expect(idKeyed.filter((r) => applicable(r).length === 0).map(show)).toEqual([]);
  });

  it("names a param the route actually has, on a handler", () => {
    const wrong = idKeyed.flatMap((r) => r.onHandler.filter((m) => "model" in m && !params(r.path).includes(m.param)).map((m) => `${show(r)}  (param "${(m as { param: string }).param}")`));
    expect(wrong).toEqual([]);
  });

  it("names a model that leads to a project", () => {
    const models = [...new Set(routes.flatMap((r) => [...r.onHandler, ...r.onClass]).flatMap((m) => ("model" in m ? [m.model] : [])))];
    expect(models.filter((m) => projectPathFor(m) === null)).toEqual([]);
  });

  it("gives a reason whenever it opts out", () => {
    const vague = routes.flatMap((r) => [...r.onHandler, ...r.onClass]).filter((m) => "exempt" in m && m.exempt.trim().length < 10);
    expect(vague).toEqual([]);
  });
});
