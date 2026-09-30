import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import * as pkijs from "pkijs";
import { requestTimestamp, verifyTimestampToken } from "./timestamp";

// Real tokens from http://timestamp.digicert.com and http://timestamp.sectigo.com (2026-09-30)
// over these 32 bytes. The signer's chain is checked as of the token's own time, so the fixtures
// stay valid after the TSA certificates expire.
const TOKEN = readFileSync(join(__dirname, "__fixtures__/digicert-token.tsr"));
const SECTIGO_TOKEN = readFileSync(join(__dirname, "__fixtures__/sectigo-token.tsr"));
const DATA = Buffer.from("cd2473129ac2cf31e6dfb8bb6582866cce61726598da95a2715b7017475285b9", "hex");

function replyWith(status: number, token?: Buffer): typeof fetch {
  const response = new pkijs.TimeStampResp({
    status: new pkijs.PKIStatusInfo({ status }),
    ...(token ? { timeStampToken: pkijs.ContentInfo.fromBER(new Uint8Array(token).buffer) } : {}),
  });
  const body = Buffer.from(response.toSchema().toBER());
  return jest.fn().mockResolvedValue(new Response(body, { status: 200 })) as unknown as typeof fetch;
}

describe("verifyTimestampToken", () => {
  it("accepts a TSA's token for the data it timestamped", async () => {
    await expect(verifyTimestampToken(TOKEN, DATA)).resolves.toEqual({ valid: true, timestampedAt: new Date("2026-09-30T07:51:58.000Z") });
  });

  // Both tokens carry their root cross-signed by an older TLS root as well; they must verify
  // against the shipped timestamping roots alone, whatever Node's own root bundle holds.
  it("accepts a token whose TSA also ships its root cross-signed by an older one", async () => {
    await expect(verifyTimestampToken(SECTIGO_TOKEN, DATA)).resolves.toMatchObject({ valid: true });
  });

  it("rejects it for any other data", async () => {
    await expect(verifyTimestampToken(TOKEN, Buffer.alloc(32))).resolves.toEqual({ valid: false, reason: "the token timestamps different data" });
  });

  it("rejects a token altered after signing", async () => {
    const altered = Buffer.from(TOKEN);
    altered[altered.length - 20] ^= 0xff;
    await expect(verifyTimestampToken(altered, DATA)).resolves.toMatchObject({ valid: false, reason: "the signature doesn't match" });
  });

  it("rejects a signer that doesn't chain to a trusted root", async () => {
    await expect(verifyTimestampToken(TOKEN, DATA, { trustedRoots: [] })).resolves.toMatchObject({ valid: false, reason: expect.stringMatching(/can't be verified/) });
  });

  it("rejects bytes that aren't a token", async () => {
    await expect(verifyTimestampToken(Buffer.from("not a token"), DATA)).resolves.toEqual({ valid: false, reason: "the token can't be read" });
  });
});

describe("requestTimestamp", () => {
  it("posts an RFC 3161 query and refuses a token that answers another request", async () => {
    const fetchImpl = replyWith(pkijs.PKIStatus.granted, TOKEN);
    // The fixture was issued for another nonce, so it must not be accepted as the answer here.
    await expect(requestTimestamp("https://tsa.example", DATA, fetchImpl)).rejects.toThrow(/answers a different request/);
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe("https://tsa.example");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/timestamp-query" } });
    const query = pkijs.TimeStampReq.fromBER(new Uint8Array(init.body).buffer);
    // Only the data's SHA-256 is sent, never the data itself.
    expect(Buffer.from(query.messageImprint.hashedMessage.valueBlock.valueHexView)).toEqual(createHash("sha256").update(DATA).digest());
    expect(query.certReq).toBe(true);
  });

  it("reports a refusal", async () => {
    await expect(requestTimestamp("https://tsa.example", DATA, replyWith(pkijs.PKIStatus.rejection))).rejects.toThrow(/refused the request/);
  });

  it("reports an HTTP error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response("down", { status: 503 })) as unknown as typeof fetch;
    await expect(requestTimestamp("https://tsa.example", DATA, fetchImpl)).rejects.toThrow(/answered 503/);
  });
});
