import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isDev = process.env.NODE_ENV === "development";

// The API and the Sentry ingest endpoint aren't 'self' — the browser calls them directly from
// client components (api-client.ts, @sentry/browser) — so connect-src has to name them explicitly
// or every fetch/error-report is silently blocked. Both are env-driven, so derive the origins from
// the same vars the client code already reads rather than hardcoding a host that only matches one
// deployment.
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:4000";
const sentryOrigin = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN?.replace(/^[^@]*@/, "https://"));

const connectSrc = ["'self'", apiOrigin, sentryOrigin, isDev ? "ws://localhost:*" : null]
  .filter((v): v is string => Boolean(v))
  .join(" ");

// No nonce/strict-dynamic here (see the CSP guide in node_modules/next/dist/docs/01-app/02-guides/
// content-security-policy.md): that requires every page to opt into dynamic rendering, which this
// app doesn't do today. 'unsafe-inline' on script/style is the documented fallback for apps that
// render statically — still blocks the actual threat this heads off (a third-party script/style
// origin), just not same-origin inline injection.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  font-src 'self' data:;
  connect-src ${connectSrc};
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
`
  .replace(/\s{2,}/g, " ")
  .trim();

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Docker deployment: a self-contained server bundle instead of requiring the full node_modules
  // tree on the host — see apps/web/Dockerfile.
  output: "standalone",
  // Monorepo: the tracer's project root defaults to apps/web itself, which would miss
  // packages/shared's compiled output that the build actually depends on.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  outputFileTracingIncludes: {
    "/*": [
      // i18n/request.ts loads locale files via a dynamic `import(`./messages/${locale}.json`)`,
      // which the tracer can't resolve on its own — spell it out so a locale file isn't
      // silently missing from the standalone output.
      "./i18n/messages/**/*.json",
      // Confirmed by actually running a built standalone image: the tracer copies next's own
      // nested `@swc/helpers` (pnpm hoists/dedupes it under next's own hashed .pnpm entry) but
      // drops its `esm/` subfolder, which next's require-hook needs at startup —
      // MODULE_NOT_FOUND on `@swc/helpers/esm/_interop_require_default.js` otherwise. The glob
      // (rather than the exact hashed folder name) survives that hash changing on a future
      // `pnpm install`.
      "../../node_modules/.pnpm/next@*/node_modules/@swc/helpers/**/*",
    ],
  },
};

export default withNextIntl(nextConfig);
