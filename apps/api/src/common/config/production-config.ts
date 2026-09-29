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

  // Where the app runs and what it talks to. Each has a development fallback (localhost, the
  // console instead of email) that would pass unnoticed in production.
  for (const name of ["DATABASE_URL", "REDIS_URL"] as const) {
    if (!env[name]?.trim()) problems.push(`${name} is unset.`);
  }
  for (const name of ["WEB_ORIGIN", "API_ORIGIN"] as const) {
    const value = env[name]?.trim();
    if (!value) problems.push(`${name} is unset — links in emails and OAuth/SSO callbacks are built from it.`);
    else if (!/^https:\/\//.test(value) || /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(value)) {
      problems.push(`${name}="${value}" must be the public https:// address, not a local one.`);
    }
  }
  // Without SMTP the mailer only logs: invitations, password resets and invoices would never arrive.
  for (const name of ["SMTP_HOST", "SMTP_FROM"] as const) {
    if (!env[name]?.trim()) problems.push(`${name} is unset — outgoing email would only be written to the log.`);
  }
  // Every token the app signs. The portal secrets fall back to JWT_SECRET in development; in
  // production each portal gets its own, so a leaked portal secret can't mint staff tokens.
  const secrets = ["JWT_SECRET", "PORTAL_JWT_SECRET", "SUBCONTRACTOR_PORTAL_JWT_SECRET", "SUPPLIER_PORTAL_JWT_SECRET"] as const;
  const seen = new Map<string, string>();
  for (const name of secrets) {
    const value = env[name];
    if (!value) {
      problems.push(`${name} is unset. Generate one with \`openssl rand -base64 48\`.`);
      continue;
    }
    if (value.length < 32 || /change-?me|dev-only|placeholder/i.test(value)) {
      problems.push(`${name} is too short or still a placeholder — use at least 32 random characters.`);
    }
    const twin = seen.get(value);
    if (twin) problems.push(`${name} is the same as ${twin}; each must be different.`);
    seen.set(value, name);
  }
  // Company subscriptions are billed through Stripe; without these nobody can subscribe or renew.
  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const) {
    if (!env[name]?.trim()) problems.push(`${name} is unset — subscriptions can't be taken or renewed.`);
  }
  // PushService signs every web push with this key pair and reads it at boot, so without it the
  // API wouldn't start anyway — only with a far less helpful error.
  for (const name of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const) {
    if (!env[name]?.trim()) problems.push(`${name} is unset — generate a key pair with \`npx web-push generate-vapid-keys\` (VAPID_SUBJECT is a mailto: address).`);
  }

  if (problems.length > 0) {
    throw new Error(`Refusing to start in production:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
}

/**
 * Settings that are allowed in production but usually a mistake there — logged at startup rather
 * than refused, since a staging server legitimately runs NODE_ENV=production on test keys.
 */
export function productionConfigWarnings(env: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== "production") return [];
  const warnings: string[] = [];
  if (env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) warnings.push("STRIPE_SECRET_KEY is a test key: no real payments will be taken.");
  if (!env.STRIPE_CONNECT_WEBHOOK_SECRET) warnings.push("STRIPE_CONNECT_WEBHOOK_SECRET is unset: clients' online invoice payments won't be recorded.");
  if (!env.SENTRY_DSN) warnings.push("SENTRY_DSN is unset: server errors are only in the container log.");
  return warnings;
}
