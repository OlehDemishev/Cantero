import {
  currentKeyPrefix,
  decryptSecret,
  encryptSecret,
  isEncrypted,
  isEncryptedWithCurrentKey,
  withDecryptedTokens,
  withEncryptedTokens,
} from "./secret-box";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

describe("secret-box", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("round-trips a secret, never storing it in the clear", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY_A;
    const stored = encryptSecret("xero-refresh-token");
    expect(stored).not.toContain("xero-refresh-token");
    expect(isEncrypted(stored)).toBe(true);
    expect(decryptSecret(stored)).toBe("xero-refresh-token");
  });

  it("uses a fresh IV every time, so equal secrets don't look equal at rest", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY_A;
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("reads a row written before encryption existed as is", () => {
    expect(decryptSecret("legacy-plaintext-token")).toBe("legacy-plaintext-token");
  });

  it("leaves an empty value (lexoffice's unused refresh token) empty", () => {
    expect(encryptSecret("")).toBe("");
  });

  it("refuses a tampered ciphertext instead of returning garbage", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY_A;
    const stored = encryptSecret("secret");
    const tampered = stored.slice(0, -4) + (stored.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("decrypts with DATA_ENCRYPTION_KEY_PREVIOUS after a rotation, and writes with the new key", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY_A;
    const underA = encryptSecret("totp-secret");

    process.env.DATA_ENCRYPTION_KEY = KEY_B;
    process.env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
    expect(decryptSecret(underA)).toBe("totp-secret");
    expect(isEncryptedWithCurrentKey(underA)).toBe(false);
    expect(isEncryptedWithCurrentKey(encryptSecret("totp-secret"))).toBe(true);

    delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
    expect(() => decryptSecret(underA)).toThrow(/isn't DATA_ENCRYPTION_KEY/);
  });

  it("refuses to use the development key in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it("encrypts and decrypts a connection's token fields, leaving the rest alone", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY_A;
    const data = withEncryptedTokens({ accessToken: "a", refreshToken: "r", viewerAccessToken: null, hubId: "hub" });
    expect(data.accessToken.startsWith(currentKeyPrefix())).toBe(true);
    expect(data.viewerAccessToken).toBeNull();
    expect(data.hubId).toBe("hub");
    expect(withDecryptedTokens(data)).toEqual({ accessToken: "a", refreshToken: "r", viewerAccessToken: null, hubId: "hub" });
    expect(withDecryptedTokens(null)).toBeNull();
  });
});
