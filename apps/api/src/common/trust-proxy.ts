/** Parses TRUST_PROXY_HOPS into the value Express's `trust proxy` setting expects — a positive
 * number of reverse-proxy hops to trust X-Forwarded-For through. Anything missing, non-numeric,
 * zero, or negative resolves to 0 (don't trust any proxy), which is the fail-safe default: an
 * unset or garbage value must never accidentally make req.ip trust an attacker-controlled header. */
export function resolveTrustProxyHops(rawValue: string | undefined): number {
  const hops = Number(rawValue);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}
