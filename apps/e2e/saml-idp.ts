import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SignedXml } from "xml-crypto";

/**
 * A throwaway SAML identity provider for the SSO spec: a key pair generated fresh for each run
 * (never committed, so nothing for a secret scanner to flag) and assertions signed the way a real
 * IdP (Okta, Entra ID, Google Workspace) signs them — RSA-SHA256 over the exclusive-canonicalized
 * <Assertion>, enveloped signature placed right after its <Issuer>. That makes the API's
 * @node-saml validation run its real cryptographic checks, not a mocked "valid: true".
 */
export interface TestIdp {
  issuer: string;
  entryPoint: string;
  certPem: string;
  privateKeyPem: string;
  dispose(): void;
}

export function createTestIdp(): TestIdp {
  const dir = mkdtempSync(join(tmpdir(), "cantero-e2e-idp-"));
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
    "-subj", "/CN=cantero-e2e-idp",
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"),
  ], { stdio: "ignore" });
  return {
    issuer: "https://idp.e2e.test/metadata",
    entryPoint: "https://idp.e2e.test/sso",
    certPem: readFileSync(join(dir, "cert.pem"), "utf-8"),
    privateKeyPem: readFileSync(join(dir, "key.pem"), "utf-8"),
    dispose: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export interface AssertionInput {
  email: string;
  displayName: string;
  spIssuer: string;
  acsUrl: string;
}

export function signedSamlResponse(idp: TestIdp, input: AssertionInput): string {
  const now = new Date();
  const later = new Date(now.getTime() + 5 * 60_000);
  const before = new Date(now.getTime() - 60_000);
  const iso = (d: Date) => d.toISOString();
  const assertionId = `_a${randomUUID().replace(/-/g, "")}`;

  const xml =
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r${randomUUID().replace(/-/g, "")}" Version="2.0" IssueInstant="${iso(now)}" Destination="${input.acsUrl}">` +
    `<saml:Issuer>${idp.issuer}</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    `<saml:Assertion ID="${assertionId}" Version="2.0" IssueInstant="${iso(now)}">` +
    `<saml:Issuer>${idp.issuer}</saml:Issuer>` +
    `<saml:Subject>` +
    `<saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${input.email}</saml:NameID>` +
    `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">` +
    `<saml:SubjectConfirmationData NotOnOrAfter="${iso(later)}" Recipient="${input.acsUrl}"/>` +
    `</saml:SubjectConfirmation>` +
    `</saml:Subject>` +
    `<saml:Conditions NotBefore="${iso(before)}" NotOnOrAfter="${iso(later)}">` +
    `<saml:AudienceRestriction><saml:Audience>${input.spIssuer}</saml:Audience></saml:AudienceRestriction>` +
    `</saml:Conditions>` +
    `<saml:AuthnStatement AuthnInstant="${iso(now)}" SessionIndex="_s${randomUUID().slice(0, 8)}">` +
    `<saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>` +
    `</saml:AuthnStatement>` +
    `<saml:AttributeStatement>` +
    `<saml:Attribute Name="email"><saml:AttributeValue>${input.email}</saml:AttributeValue></saml:Attribute>` +
    `<saml:Attribute Name="displayName"><saml:AttributeValue>${input.displayName}</saml:AttributeValue></saml:Attribute>` +
    `</saml:AttributeStatement>` +
    `</saml:Assertion>` +
    `</samlp:Response>`;

  const sig = new SignedXml({ privateKey: idp.privateKeyPem, publicCert: idp.certPem });
  sig.signatureAlgorithm = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
  sig.canonicalizationAlgorithm = "http://www.w3.org/2001/10/xml-exc-c14n#";
  sig.addReference({
    xpath: "//*[local-name(.)='Assertion']",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });
  sig.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']", action: "after" },
  });
  return sig.getSignedXml();
}

/** What the IdP's login page would send back to the browser: a form that immediately POSTs the
 * base64 SAMLResponse to the SP's ACS URL — the standard HTTP-POST binding. */
export function autoPostPage(acsUrl: string, samlResponseXml: string): string {
  const encoded = Buffer.from(samlResponseXml, "utf-8").toString("base64");
  return `<!doctype html><html><body onload="document.forms[0].submit()">
<form method="POST" action="${acsUrl}"><input type="hidden" name="SAMLResponse" value="${encoded}"></form>
</body></html>`;
}
