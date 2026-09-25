/** Parses TRUST_PROXY_HOPS into the value Express's `trust proxy` setting expects — a positive
 * number of reverse-proxy hops to trust X-Forwarded-For through. Anything missing, non-numeric,
 * zero, or negative resolves to 0 (don't trust any proxy), which is the fail-safe default: an
 * unset or garbage value must never accidentally make req.ip trust an attacker-controlled header. */
export function resolveTrustProxyHops(rawValue: string | undefined): number {
  const hops = Number(rawValue);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}

/** Express middleware for TRUST_PROXY_HOPS=0: the first request that arrives with an
 * X-Forwarded-For header means a proxy is in front after all, and every client is being
 * rate-limited as that one proxy address. Logs that once, loudly, rather than staying silent
 * until users report being locked out. It can't fix anything itself — trusting the header without
 * being told how many hops to trust would let any client spoof its own IP. */
export function warnOnceIfProxiedButUntrusted(warn: (message: string) => void) {
  let warned = false;
  return (req: { headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void) => {
    if (!warned && req.headers["x-forwarded-for"]) {
      warned = true;
      warn(
        "Requests carry X-Forwarded-For but TRUST_PROXY_HOPS=0: every client shares the reverse proxy's IP, so " +
          "per-IP rate limits (login, 2FA, password reset) are one bucket for all users. Set TRUST_PROXY_HOPS to the number of proxies in front of the API.",
      );
    }
    next();
  };
}
