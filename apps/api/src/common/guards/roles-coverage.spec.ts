import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { OPEN_TO_ALL_ROLES_KEY, ROLES_KEY } from "../decorators/roles.decorator";
import { REQUIRES_KEY } from "../decorators/permissions.decorator";

/**
 * Every internal route says who may call it: @Requires (a capability a company can adjust per role),
 * @Roles (fixed roles), or @OpenToAllRoles with the reason it
 * is meant for every member. A route that says neither was open to a worker without anyone deciding
 * so — which is how payments, tax profiles and HR cases ended up open before this test existed.
 * @Public() routes (portal, signed links, webhooks) authenticate differently and are left out.
 */
function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith(".controller.ts") ? [full] : [];
  });
}

interface Route {
  where: string;
  roles: string[] | undefined;
  requires: unknown;
  open: string | undefined;
}

function routesOf(file: string): Route[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const exports = require(file) as Record<string, unknown>;
  const routes: Route[] = [];
  for (const cls of Object.values(exports)) {
    if (typeof cls !== "function" || Reflect.getMetadata(PATH_METADATA, cls) === undefined || Reflect.getMetadata(IS_PUBLIC_KEY, cls)) continue;
    for (const name of Object.getOwnPropertyNames(cls.prototype)) {
      const handler = cls.prototype[name];
      if (name === "constructor" || typeof handler !== "function" || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
      if (Reflect.getMetadata(IS_PUBLIC_KEY, handler)) continue;
      routes.push({
        where: `${cls.name}.${name}`,
        roles: Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, cls),
        requires: Reflect.getMetadata(REQUIRES_KEY, handler) ?? Reflect.getMetadata(REQUIRES_KEY, cls),
        open: Reflect.getMetadata(OPEN_TO_ALL_ROLES_KEY, handler) ?? Reflect.getMetadata(OPEN_TO_ALL_ROLES_KEY, cls),
      });
    }
  }
  return routes;
}

describe("every internal route says which roles may call it", () => {
  const routes = controllerFiles(join(__dirname, "../..")).flatMap(routesOf);

  it("finds the routes (sanity check on the scan itself)", () => {
    expect(routes.length).toBeGreaterThan(900);
  });

  it("has @Requires, @Roles or @OpenToAllRoles", () => {
    expect(routes.filter((r) => !r.requires && !r.roles?.length && !r.open).map((r) => r.where)).toEqual([]);
  });

  it("keeps fixed @Roles to the routes no permission may hand out", () => {
    // Everything else is a capability a company can adjust per role. These stay with the owner (and
    // admin), since whoever holds them can take the company over: billing, sign-in, API access,
    // deleting the company, and tying it to a franchise parent.
    const fixed = [
      "ApiKeysController.create",
      "ApiKeysController.list",
      "ApiKeysController.revoke",
      "BillingController.changePlan",
      "BillingController.createCheckoutSession",
      "BillingController.createPortalSession",
      "BillingController.stripeConnectOnboardingLink",
      "BillingController.stripeConnectStatus",
      "BillingController.updateSeats",
      "CompanyController.cancelDeletionRequest",
      "CompanyController.generateFranchiseLinkCode",
      "CompanyController.linkToParent",
      "CompanyController.requestDeletion",
      "SsoController.disable",
      "SsoController.getConfig",
      "SsoController.spMetadata",
      "SsoController.updateConfig",
    ];
    expect(routes.filter((r) => r.roles?.length).map((r) => r.where).sort()).toEqual(fixed);
  });

  it("gives a reason whenever it's open to all", () => {
    expect(routes.filter((r) => r.open !== undefined && r.open.trim().length < 15).map((r) => r.where)).toEqual([]);
  });
});
