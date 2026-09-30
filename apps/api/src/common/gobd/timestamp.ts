import { createHash, randomBytes } from "crypto";
import { rootCertificates } from "tls";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

/**
 * RFC 3161 trusted timestamps: a Time Stamping Authority signs "data with this SHA-256 existed at
 * this time". Used to anchor the GoBD ledger outside the database (see GobdAnchorService): the data
 * is the 32 bytes of a chain head's hash, and only their SHA-256 ever leaves the server.
 */

const SHA256_OID = "2.16.840.1.101.3.4.2.1";
const TIMEOUT_MS = 15_000;

export interface Timestamp {
  /** The TimeStampToken as the TSA returned it: DER-encoded CMS SignedData. */
  token: Buffer;
  /** When the TSA says it saw the hash (TSTInfo.genTime). */
  timestampedAt: Date;
}

export type TokenCheck = { valid: true; timestampedAt: Date } | { valid: false; reason: string };

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest();

/** The public web PKI roots bundled with Node — the ones well-known TSAs (DigiCert, Sectigo,
 * GlobalSign, ...) chain up to, so no CA file has to be configured or kept current. */
function bundledRoots(): pkijs.Certificate[] {
  return rootCertificates.map((pem) => {
    const der = Buffer.from(pem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, ""), "base64");
    return pkijs.Certificate.fromBER(toArrayBuffer(der));
  });
}

let roots: pkijs.Certificate[] | undefined;

/** Asks `tsaUrl` to timestamp `data` (by its SHA-256), and checks the answer before keeping it. */
export async function requestTimestamp(tsaUrl: string, data: Buffer, fetchImpl: typeof fetch = fetch): Promise<Timestamp> {
  const nonce = randomBytes(8);
  nonce[0] &= 0x7f; // a positive INTEGER
  const request = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: SHA256_OID }),
      hashedMessage: new asn1js.OctetString({ valueHex: toArrayBuffer(sha256(data)) }),
    }),
    nonce: new asn1js.Integer({ valueHex: toArrayBuffer(nonce) }),
    // Ask for the TSA's certificate inside the token, so it can be checked without fetching it.
    certReq: true,
  });

  const res = await fetchImpl(tsaUrl, {
    method: "POST",
    headers: { "Content-Type": "application/timestamp-query" },
    body: Buffer.from(request.toSchema().toBER()),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`The timestamp authority answered ${res.status}`);

  const response = pkijs.TimeStampResp.fromBER(await res.arrayBuffer());
  const status = response.status.status;
  if (status !== pkijs.PKIStatus.granted && status !== pkijs.PKIStatus.grantedWithMods) {
    throw new Error(`The timestamp authority refused the request (PKIStatus ${status})`);
  }
  if (!response.timeStampToken) throw new Error("The timestamp authority's answer holds no token");
  const token = Buffer.from(response.timeStampToken.toSchema().toBER());

  const check = await verifyTimestampToken(token, data, { nonce });
  if (!check.valid) throw new Error(`The timestamp authority's token doesn't check out: ${check.reason}`);
  return { token, timestampedAt: check.timestampedAt };
}

/**
 * Checks a stored token: it timestamps exactly `data`, its signature is intact, and the signing
 * certificate chains up to a trusted root as of the time it claims. Any one failing means the token
 * proves nothing about that data.
 */
export async function verifyTimestampToken(
  token: Buffer,
  data: Buffer,
  options: { nonce?: Buffer; trustedRoots?: pkijs.Certificate[] } = {},
): Promise<TokenCheck> {
  let signedData: pkijs.SignedData;
  let tstInfo: pkijs.TSTInfo;
  try {
    const contentInfo = pkijs.ContentInfo.fromBER(toArrayBuffer(token));
    signedData = new pkijs.SignedData({ schema: contentInfo.content });
    const eContent = signedData.encapContentInfo.eContent;
    if (!eContent) return { valid: false, reason: "the token has no timestamp info" };
    tstInfo = pkijs.TSTInfo.fromBER(eContent.getValue());
  } catch {
    return { valid: false, reason: "the token can't be read" };
  }

  if (tstInfo.messageImprint.hashAlgorithm.algorithmId !== SHA256_OID) {
    return { valid: false, reason: "the token isn't over a SHA-256 hash" };
  }
  const stamped = Buffer.from(tstInfo.messageImprint.hashedMessage.valueBlock.valueHexView);
  if (!stamped.equals(sha256(data))) return { valid: false, reason: "the token timestamps different data" };
  if (options.nonce) {
    const nonce = tstInfo.nonce ? Buffer.from(tstInfo.nonce.valueBlock.valueHexView) : undefined;
    // DER may prepend a zero byte to keep the INTEGER positive.
    if (!nonce || !nonce.subarray(nonce.length - options.nonce.length).equals(options.nonce)) {
      return { valid: false, reason: "the token answers a different request" };
    }
  }

  try {
    const result = await signedData.verify({
      signer: 0,
      data: toArrayBuffer(data),
      trustedCerts: options.trustedRoots ?? (roots ??= bundledRoots()),
      checkChain: true,
      checkDate: tstInfo.genTime,
      extendedMode: true,
    });
    if (!result.signatureVerified) return { valid: false, reason: "the signature doesn't match" };
    if (!result.signerCertificateVerified) return { valid: false, reason: "the signer isn't a trusted timestamp authority" };
  } catch (err) {
    const message = (err as { message?: string }).message ?? String(err);
    return { valid: false, reason: `the signature can't be verified (${message})` };
  }
  return { valid: true, timestampedAt: tstInfo.genTime };
}
