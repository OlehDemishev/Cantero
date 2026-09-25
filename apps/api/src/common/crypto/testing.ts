import { decryptSecret, isEncrypted } from "./secret-box";

/** Jest asymmetric matcher: a value stored encrypted (see secret-box.ts) that decrypts to `plain`. */
export function encrypted(plain: string) {
  return {
    asymmetricMatch: (actual: unknown) => typeof actual === "string" && isEncrypted(actual) && decryptSecret(actual) === plain,
    toString: () => `encrypted(${JSON.stringify(plain)})`,
    toAsymmetricMatcher: () => `encrypted(${JSON.stringify(plain)})`,
  };
}
