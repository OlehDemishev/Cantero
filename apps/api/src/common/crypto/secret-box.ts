import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Logger } from "@nestjs/common";

/**
 * Encryption at rest for secrets the app has to read back — OAuth access/refresh tokens of every
 * connector, webhook signing secrets, TOTP secrets. Hashing (as for passwords, sessions and API
 * keys) isn't an option for these, and stored in the clear, one leaked backup or read-only
 * database access would hand over every customer's QuickBooks/Xero/DATEV books and every user's
 * second factor.
 *
 * AES-256-GCM with a key that lives outside the database (DATA_ENCRYPTION_KEY: 32 bytes, base64).
 * Stored form: `enc:v1:<key id>:<base64(iv | tag | ciphertext)>`. The key id lets a rotation
 * decrypt with DATA_ENCRYPTION_KEY_PREVIOUS while every new write uses the current key (see
 * SecretsBackfillService for re-encrypting old rows). A value without the prefix is a row written
 * before encryption existed and is read back as is — SecretsBackfillService encrypts those on boot.
 *
 * Production refuses to start without a valid key (assertProductionConfig). Elsewhere a fixed,
 * public development key is used so local setups and tests need no configuration — it protects
 * nothing, which is fine where there's nothing to protect.
 */

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEV_KEY = createHash("sha256").update("cantero-development-only-key — never protects real data").digest();

interface Key {
  id: string;
  bytes: Buffer;
}

let cached: { current: Key; all: Map<string, Key>; source: string } | undefined;
const logger = new Logger("SecretBox");

/** Parses a base64 32-byte key, or explains what's wrong with it. */
export function parseEncryptionKey(raw: string): Buffer {
  const bytes = Buffer.from(raw.trim(), "base64");
  if (bytes.length !== 32) {
    throw new Error("must be 32 random bytes, base64-encoded — generate one with `openssl rand -base64 32`");
  }
  return bytes;
}

function toKey(bytes: Buffer): Key {
  return { id: createHash("sha256").update(bytes).digest("hex").slice(0, 8), bytes };
}

function keys() {
  const source = `${process.env.DATA_ENCRYPTION_KEY ?? ""}|${process.env.DATA_ENCRYPTION_KEY_PREVIOUS ?? ""}`;
  if (cached && cached.source === source) return cached;

  let current: Key;
  if (process.env.DATA_ENCRYPTION_KEY) {
    current = toKey(parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY));
  } else {
    if (process.env.NODE_ENV === "production") throw new Error("DATA_ENCRYPTION_KEY is not set");
    current = toKey(DEV_KEY);
    if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
      logger.warn("DATA_ENCRYPTION_KEY is not set — encrypting stored secrets with the public development key");
    }
  }
  const all = new Map<string, Key>([[current.id, current]]);
  if (process.env.DATA_ENCRYPTION_KEY_PREVIOUS) {
    const previous = toKey(parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY_PREVIOUS));
    all.set(previous.id, previous);
  }
  cached = { current, all, source };
  return cached;
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/** How every value encrypted with the current key begins — anything else is plaintext or an older key's. */
export function currentKeyPrefix(): string {
  return `${PREFIX}${keys().current.id}:`;
}

/** Whether `stored` is already encrypted with the current key — false means the backfill should rewrite it. */
export function isEncryptedWithCurrentKey(stored: string): boolean {
  return stored.startsWith(currentKeyPrefix());
}

export function encryptSecret(plain: string): string {
  if (plain === "" || isEncrypted(plain)) return plain;
  const { current } = keys();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", current.bytes, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${current.id}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const [keyId, payload] = stored.slice(PREFIX.length).split(":", 2);
  const key = keys().all.get(keyId);
  if (!key || !payload) {
    throw new Error(`Stored secret was encrypted with key ${keyId}, which isn't DATA_ENCRYPTION_KEY or DATA_ENCRYPTION_KEY_PREVIOUS`);
  }
  const raw = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key.bytes, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
}

export function encryptSecretOrNull(plain: string | null | undefined): string | null {
  return plain == null ? null : encryptSecret(plain);
}

export function decryptSecretOrNull(stored: string | null | undefined): string | null {
  return stored == null ? null : decryptSecret(stored);
}

type TokenFields = { accessToken?: string; refreshToken?: string; viewerAccessToken?: string | null };

/** A connector's stored row with its OAuth tokens readable — every connector loads its connection
 * through this, so the rest of its code (and refreshIfExpiring's comparison of refresh tokens)
 * only ever sees plaintext. */
export function withDecryptedTokens<T extends TokenFields>(row: T): T;
export function withDecryptedTokens<T extends TokenFields>(row: T | null): T | null;
export function withDecryptedTokens<T extends TokenFields>(row: T | null): T | null {
  if (!row) return row;
  return {
    ...row,
    ...(row.accessToken !== undefined && { accessToken: decryptSecret(row.accessToken) }),
    ...(row.refreshToken !== undefined && { refreshToken: decryptSecret(row.refreshToken) }),
    ...(row.viewerAccessToken !== undefined && { viewerAccessToken: decryptSecretOrNull(row.viewerAccessToken) }),
  };
}

/** The write-side counterpart: the same data with whichever token fields it carries encrypted. */
export function withEncryptedTokens<T extends TokenFields>(data: T): T {
  return {
    ...data,
    ...(data.accessToken !== undefined && { accessToken: encryptSecret(data.accessToken) }),
    ...(data.refreshToken !== undefined && { refreshToken: encryptSecret(data.refreshToken) }),
    ...(data.viewerAccessToken !== undefined && { viewerAccessToken: encryptSecretOrNull(data.viewerAccessToken) }),
  };
}
