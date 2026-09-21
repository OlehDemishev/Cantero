import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { apiUrl, databaseUrl } from "../fixtures";
import { api, login } from "../api";
import { autoPostPage, createTestIdp, signedSamlResponse, type TestIdp } from "../saml-idp";

/**
 * Enterprise SSO end to end: the real login page starts the flow, the browser is sent to the IdP,
 * and the IdP's signed assertion is POSTed back to the real ACS endpoint. Only the IdP itself is
 * simulated (intercepted at its URL and answered with an auto-submitting form, exactly what a real
 * IdP returns) — the SAML validation, just-in-time provisioning and token hand-off are all real.
 *
 * Temporarily points the demo company's SSO at a throwaway IdP on a test-only domain, and restores
 * whatever was configured before once done.
 */
const SSO_DOMAIN = "e2e-sso.test";

let idp: TestIdp;
let ownerToken: string;
let companyId: string;
let previousSso: { ssoDomain: string | null; ssoEntryPoint: string | null; ssoIssuer: string | null; ssoCert: string | null };

test.beforeAll(async () => {
  idp = createTestIdp();
  ownerToken = await login();
  companyId = (await api<{ company: { id: string } }>("GET", "/me", ownerToken)).company.id;
  previousSso = await api("GET", "/company/sso", ownerToken);
  await api("PATCH", "/company/sso", ownerToken, { domain: SSO_DOMAIN, entryPoint: idp.entryPoint, issuer: idp.issuer, cert: idp.certPem });
});

test.afterAll(async () => {
  if (previousSso?.ssoDomain && previousSso.ssoEntryPoint && previousSso.ssoIssuer && previousSso.ssoCert) {
    await api("PATCH", "/company/sso", ownerToken, {
      domain: previousSso.ssoDomain,
      entryPoint: previousSso.ssoEntryPoint,
      issuer: previousSso.ssoIssuer,
      cert: previousSso.ssoCert,
    });
  } else {
    await api("DELETE", "/company/sso", ownerToken);
  }
  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  try {
    await db.query(`DELETE FROM users WHERE email LIKE $1`, [`%@${SSO_DOMAIN}`]);
  } finally {
    await db.end();
  }
  idp.dispose();
});

function acsUrl() {
  return `${apiUrl()}/auth/sso/acs/${companyId}`;
}
function spIssuer() {
  return `${apiUrl()}/auth/sso/metadata/${companyId}`;
}

/** Starts SSO from the real login page and answers the IdP redirect with `respond`'s SAMLResponse. */
async function signInViaIdp(page: Page, email: string, respond: (email: string) => string) {
  let samlRequestSeen = false;
  await page.route(`${idp.entryPoint}**`, async (route) => {
    samlRequestSeen = new URL(route.request().url()).searchParams.has("SAMLRequest");
    await route.fulfill({ contentType: "text/html", body: autoPostPage(acsUrl(), respond(email)) });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with company SSO instead" }).click();
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL(/\/sso\/callback|\/dashboard/);
  expect(samlRequestSeen).toBe(true);
}

test("a new employee signs in through the company IdP and is provisioned as a worker", async ({ page }) => {
  const email = `new.hire.${Date.now()}@${SSO_DOMAIN}`;
  await signInViaIdp(page, email, (e) => signedSamlResponse(idp, { email: e, displayName: "New Hire", spIssuer: spIssuer(), acsUrl: acsUrl() }));

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  const token = await page.evaluate(() => localStorage.getItem("cantero_token"));
  const me = await api<{ user: { email: string; name: string; role: string }; company: { id: string } }>("GET", "/me", token);
  expect(me.user.email).toBe(email);
  expect(me.user.name).toBe("New Hire");
  expect(me.user.role).toBe("worker");
  expect(me.company.id).toBe(companyId);
});

test("an assertion altered after signing is rejected", async ({ page }) => {
  const email = `mallory.${Date.now()}@${SSO_DOMAIN}`;
  await signInViaIdp(page, email, (e) =>
    // Signed for one person, then the NameID swapped for another — the digest no longer matches.
    signedSamlResponse(idp, { email: e, displayName: "Mallory", spIssuer: spIssuer(), acsUrl: acsUrl() }).replace(
      `>${e}</saml:NameID>`,
      `>ceo@${SSO_DOMAIN}</saml:NameID>`,
    ),
  );
  await expect(page).toHaveURL(/\/sso\/callback\?error=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get("error") ?? "")).toMatch(/signature/i);
  await expect(page.getByRole("link", { name: /back/i })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("cantero_token"))).toBeNull();
});

test("an assertion signed by a different IdP key is rejected", async ({ page }) => {
  const impostor = createTestIdp();
  try {
    const email = `someone.${Date.now()}@${SSO_DOMAIN}`;
    await signInViaIdp(page, email, (e) =>
      signedSamlResponse({ ...impostor, issuer: idp.issuer }, { email: e, displayName: "Someone", spIssuer: spIssuer(), acsUrl: acsUrl() }),
    );
    await expect(page).toHaveURL(/\/sso\/callback\?error=/);
    expect(new URL(page.url()).searchParams.get("error") ?? "").toMatch(/signature/i);
  } finally {
    impostor.dispose();
  }
});

test("a validly signed assertion for an email outside the company's SSO domain is rejected", async ({ page }) => {
  await signInViaIdp(page, `visitor.${Date.now()}@${SSO_DOMAIN}`, () =>
    signedSamlResponse(idp, { email: `visitor@elsewhere.test`, displayName: "Visitor", spIssuer: spIssuer(), acsUrl: acsUrl() }),
  );
  await expect(page).toHaveURL(/\/sso\/callback\?error=/);
  await expect(page.getByText("The signed-in email doesn't match this company's SSO domain")).toBeVisible();
});

test("the same signed assertion can't be used to sign in twice", async ({ browser }) => {
  const email = `replay.${Date.now()}@${SSO_DOMAIN}`;
  const captured = signedSamlResponse(idp, { email, displayName: "Replay", spIssuer: spIssuer(), acsUrl: acsUrl() });

  const first = await browser.newPage();
  await signInViaIdp(first, email, () => captured);
  await expect(first).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await first.close();

  // Someone who got hold of that POST body (a proxy log, a browser extension) submits it again.
  const second = await browser.newPage();
  await signInViaIdp(second, email, () => captured);
  await expect(second).toHaveURL(/\/sso\/callback\?error=/);
  expect(new URL(second.url()).searchParams.get("error") ?? "").toMatch(/already used/);
  expect(await second.evaluate(() => localStorage.getItem("cantero_token"))).toBeNull();
  await second.close();
});
