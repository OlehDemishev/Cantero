import { parseEncryptionKey } from "../crypto/secret-box";

/**
 * Settings a production deployment must not start without — each one, left at its development
 * default, fails silently rather than loudly: uploads vanish on the next redeploy, or every client
 * shares one login rate-limit bucket. Refusing to boot, with every problem listed at once, is
 * louder and safer than finding out from a customer. Same spirit as
 * assertQuickbooksProductionSafety, which stays separate because it only applies when QuickBooks
 * is in use. A no-op outside NODE_ENV=production.
 */
export function assertProductionConfig(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;
  const problems: string[] = [];

  // StorageService falls back to local disk without S3_BUCKET. Inside a container that disk is
  // thrown away with the container, taking every document, photo and drawing with it — so local
  // disk is only accepted when UPLOADS_DIR says where, deliberately (a mounted volume).
  if (!env.S3_BUCKET && !env.UPLOADS_DIR) {
    problems.push(
      "S3_BUCKET is unset, so uploads would go to the container's own disk and be lost on the next redeploy. " +
        "Set S3_BUCKET (and its S3_* credentials), or set UPLOADS_DIR to a path on a persistent volume.",
    );
  }

  // Behind a reverse proxy, TRUST_PROXY_HOPS=0 makes req.ip the proxy's address for every request,
  // so the per-IP limits on login, 2FA, password reset and kiosk PIN become one bucket shared by
  // all users — a few bad passwords from anyone lock everyone out. There's no way to tell from
  // here whether a proxy is in front, so production has to say so explicitly (0 included).
  if (env.TRUST_PROXY_HOPS === undefined || env.TRUST_PROXY_HOPS.trim() === "") {
    problems.push(
      "TRUST_PROXY_HOPS is unset. Set it to the number of reverse proxies in front of the API " +
        "(1 behind the bundled Caddy, see docker-compose.prod.yml), or to 0 if clients connect to it directly.",
    );
  } else if (!/^\d+$/.test(env.TRUST_PROXY_HOPS.trim())) {
    problems.push(`TRUST_PROXY_HOPS="${env.TRUST_PROXY_HOPS}" isn't a whole number of proxy hops.`);
  }

  // OAuth tokens, webhook secrets and TOTP secrets are encrypted with this (see secret-box.ts);
  // without it they'd fall back to the public development key.
  for (const name of ["DATA_ENCRYPTION_KEY", "DATA_ENCRYPTION_KEY_PREVIOUS"] as const) {
    const raw = env[name];
    if (!raw) {
      if (name === "DATA_ENCRYPTION_KEY") {
        problems.push("DATA_ENCRYPTION_KEY is unset — stored integration tokens and 2FA secrets need it. Generate one with `openssl rand -base64 32`.");
      }
      continue;
    }
    try {
      parseEncryptionKey(raw);
    } catch (err) {
      problems.push(`${name} ${(err as Error).message}.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Refusing to start in production:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
}
