import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
import { BadRequestException } from "@nestjs/common";
import { Agent, type Dispatcher } from "undici";

type Cidr = [network: number, prefix: number];

const ipv4ToInt = (a: number, b: number, c: number, d: number) => ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;

/** IPv4 ranges a webhook may never reach: everything that isn't public unicast. */
const BLOCKED_IPV4: Cidr[] = [
  [ipv4ToInt(0, 0, 0, 0), 8], // "this network"
  [ipv4ToInt(10, 0, 0, 0), 8], // private
  [ipv4ToInt(100, 64, 0, 0), 10], // carrier-grade NAT
  [ipv4ToInt(127, 0, 0, 0), 8], // loopback
  [ipv4ToInt(169, 254, 0, 0), 16], // link-local, cloud metadata
  [ipv4ToInt(172, 16, 0, 0), 12], // private
  [ipv4ToInt(192, 0, 0, 0), 24], // IETF protocol assignments
  [ipv4ToInt(192, 168, 0, 0), 16], // private
  [ipv4ToInt(198, 18, 0, 0), 15], // benchmarking
  [ipv4ToInt(224, 0, 0, 0), 4], // multicast
  [ipv4ToInt(240, 0, 0, 0), 4], // reserved, broadcast
];

function inCidr(value: number, [network, prefix]: Cidr): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((value & mask) >>> 0) === ((network & mask) >>> 0);
}

function isBlockedIpv4Int(value: number): boolean {
  return BLOCKED_IPV4.some((cidr) => inCidr(value, cidr));
}

function parseIpv4(ip: string): number | null {
  if (!isIPv4(ip)) return null;
  const [a, b, c, d] = ip.split(".").map(Number);
  return ipv4ToInt(a, b, c, d);
}

/** Expands an IPv6 address (with "::", an optional dotted IPv4 tail and an optional zone) into
 * its eight 16-bit groups, or null if it isn't one. */
export function parseIpv6(ip: string): number[] | null {
  const address = ip.replace(/^\[|\]$/g, "").split("%")[0];
  if (!isIPv6(address)) return null;
  let text = address.toLowerCase();
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail) {
    const v4 = parseIpv4(tail[1]);
    if (v4 === null) return null;
    text = `${text.slice(0, -tail[1].length)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const [head, rest] = text.split("::");
  const headGroups = head ? head.split(":") : [];
  const restGroups = rest === undefined ? [] : rest ? rest.split(":") : [];
  const fill = rest === undefined ? 0 : 8 - headGroups.length - restGroups.length;
  const groups = [...headGroups, ...Array<string>(fill).fill("0"), ...restGroups].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

const embeddedIpv4 = (high: number, low: number) => ((high << 16) | low) >>> 0;

function isBlockedIpv6(g: number[]): boolean {
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  // ::ffff:a.b.c.d (IPv4-mapped) and ::ffff:0:a.b.c.d (IPv4-translated) reach the IPv4 address.
  if (zero(0, 5) && g[5] === 0xffff) return isBlockedIpv4Int(embeddedIpv4(g[6], g[7]));
  if (zero(0, 4) && g[4] === 0xffff && g[5] === 0) return isBlockedIpv4Int(embeddedIpv4(g[6], g[7]));
  // ::/96: unspecified, loopback and the deprecated IPv4-compatible form, none of them public.
  if (zero(0, 6)) return true;
  // NAT64, well-known (64:ff9b::/96) and local-use (64:ff9b:1::/48) prefixes: the gateway
  // connects to the IPv4 address in the last 32 bits.
  if (g[0] === 0x64 && g[1] === 0xff9b && (zero(2, 6) || g[2] === 1)) return isBlockedIpv4Int(embeddedIpv4(g[6], g[7]));
  // 6to4 (2002::/16) relays to the IPv4 address in bits 16-47.
  if (g[0] === 0x2002) return isBlockedIpv4Int(embeddedIpv4(g[1], g[2]));
  // Teredo (2001::/32) tunnels to an obfuscated IPv4 address; no webhook needs it.
  if (g[0] === 0x2001 && g[1] === 0) return true;
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** True unless `ip` is a public unicast address a webhook may be delivered to. Anything that
 * doesn't parse as an IP address counts as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4 !== null) return isBlockedIpv4Int(v4);
  const v6 = parseIpv6(ip);
  return v6 === null || isBlockedIpv6(v6);
}

/** URL.hostname keeps the brackets around an IPv6 literal; DNS lookups need them gone. */
const lookupHost = (hostname: string) => hostname.replace(/^\[|\]$/g, "");

/**
 * Rejects webhook URLs that would make the server call itself or reach into the private
 * network (SSRF) — checked at create/update time by resolving the hostname. This alone doesn't
 * defend against DNS rebinding (the record can point somewhere else by the time of an actual
 * delivery, days or months later) — see resolvePinnedWebhookDispatcher() below, which every
 * delivery attempt uses for that.
 */
export async function assertPublicWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException("Invalid webhook URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BadRequestException("Webhook URL must use http or https");
  }
  if (parsed.hostname === "localhost") {
    throw new BadRequestException("Webhook URL may not point to localhost");
  }

  let address: string;
  try {
    address = (await lookup(lookupHost(parsed.hostname))).address;
  } catch {
    throw new BadRequestException("Could not resolve the webhook host");
  }
  if (isBlockedAddress(address)) {
    throw new BadRequestException("Webhook URL may not point to a private or internal address");
  }
}

/**
 * Resolves the hostname immediately before one delivery attempt, rejects a private/internal
 * result, and returns an undici dispatcher whose connection is pinned to that exact IP — the
 * request this dispatcher makes can physically never land anywhere else, even if the same
 * hostname would resolve differently a moment later. This is what actually closes the
 * DNS-rebinding gap: assertPublicWebhookUrl's registration-time check alone can't, since nothing
 * stops the DNS record from changing after a webhook is saved and validated once.
 *
 * Build a fresh dispatcher per delivery attempt — never cache or reuse one across deliveries,
 * since the whole point is re-resolving (and re-validating) every single time.
 */
export async function resolvePinnedWebhookDispatcher(rawUrl: string): Promise<Dispatcher> {
  const parsed = new URL(rawUrl);
  if (parsed.hostname === "localhost") {
    throw new Error("Webhook URL may not point to localhost");
  }

  let address: string;
  let family: number;
  try {
    const resolved = await lookup(lookupHost(parsed.hostname));
    address = resolved.address;
    family = resolved.family;
  } catch {
    throw new Error("Could not resolve the webhook host");
  }
  if (isBlockedAddress(address)) {
    throw new Error("Webhook destination resolved to a private or internal address");
  }

  return pinnedDispatcher(address, family);
}

/** Builds an undici dispatcher whose connection is pinned to the given address — no policy checks
 * of its own; resolvePinnedWebhookDispatcher() is what validates an address before this is ever
 * called with it. Exported separately (rather than inlined) so the pinning mechanism itself can
 * be proven against a real socket in tests, independent of the public/private-IP policy. */
export function pinnedDispatcher(address: string, family: number): Dispatcher {
  return new Agent({
    connect: {
      // Node's net/tls connect (which undici's Agent delegates to) requests results in the
      // Happy-Eyeballs "all" array shape by default (options.all === true) — falling back to the
      // classic single-address callback form for any dispatcher version that doesn't.
      lookup: (_hostname, options, callback) => {
        if (options && (options as { all?: boolean }).all) {
          callback(null, [{ address, family }]);
        } else {
          callback(null, address, family);
        }
      },
    },
  });
}
