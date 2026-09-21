import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { DocusignService, type DocusignConnection } from "../contracts/docusign.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { fakeProvider, openApiViolations, type OpenApiDoc } from "./harness";
import spec from "./specs/docusign-esignature-v2.1.subset.json";

const doc = spec as unknown as OpenApiDoc;
const connection: DocusignConnection = {
  id: "c",
  companyId: "co",
  accessToken: "AT",
  refreshToken: "RT",
  tokenExpiresAt: new Date(Date.now() + 3_600_000),
  accountId: "acct-1",
  apiBaseUrl: "https://demo.docusign.net",
};

describe("DocuSign eSignature v2.1 — against the published Swagger spec", () => {
  let provider: ReturnType<typeof fakeProvider>;
  const service = new DocusignService({} as PrismaService, { get: () => undefined } as unknown as ConfigService, new JwtService({ secret: "s" }));

  beforeEach(() => {
    provider = fakeProvider([
      { method: "POST", url: /\/restapi\/v2\.1\/accounts\/acct-1\/envelopes$/, respond: () => ({ status: 201, body: { envelopeId: "env-1", status: "sent", statusDateTime: "2026-09-21T10:00:00Z", uri: "/envelopes/env-1" } }) },
      { method: "GET", url: /\/restapi\/v2\.1\/accounts\/acct-1\/envelopes\/env-1$/, respond: () => ({ body: { envelopeId: "env-1", status: "completed", completedDateTime: "2026-09-21T12:00:00.0000000Z" } }) },
    ]);
  });
  afterEach(() => provider.restore());

  it("sends an envelope definition the spec accepts, to the account-scoped URL", async () => {
    const result = await service.createEnvelope(connection, {
      pdfBase64: Buffer.from("%PDF-1.7").toString("base64"),
      documentName: "MSA.pdf",
      emailSubject: "MSA — please sign",
      signerEmail: "client@example.com",
      signerName: "Client",
    });

    const [call] = provider.calls;
    expect(call.url.href).toBe("https://demo.docusign.net/restapi/v2.1/accounts/acct-1/envelopes");
    expect(openApiViolations(doc, "POST", "/v2.1/accounts/{accountId}/envelopes", call.body)).toEqual([]);
    expect(result).toEqual({ envelopeId: "env-1" });
  });

  it("the validator flags a misspelled signer field in this Swagger 2.0 spec too", () => {
    expect(openApiViolations(doc, "POST", "/v2.1/accounts/{accountId}/envelopes", { recipients: { signers: [{ emial: "x@example.com" }] } })).toEqual([
      "body.recipients.signers[0].emial is not a property the provider defines",
    ]);
  });

  it("reads status and completion time from the envelope resource's documented fields", async () => {
    await expect(service.getEnvelopeStatus(connection, "env-1")).resolves.toEqual({ status: "completed", completedAt: "2026-09-21T12:00:00.0000000Z" });
  });
});
