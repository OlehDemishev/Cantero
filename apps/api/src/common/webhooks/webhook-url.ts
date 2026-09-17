import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
import { BadRequestException } from "@nestjs/common";
import { Agent, type Dispatcher } from "undici";

export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
}

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
    address = (await lookup(parsed.hostname)).address;
  } catch {
    throw new BadRequestException("Could not resolve the webhook host");
  }
  if ((isIPv4(address) && isPrivateIpv4(address)) || (isIPv6(address) && isPrivateIpv6(address))) {
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
    const resolved = await lookup(parsed.hostname);
    address = resolved.address;
    family = resolved.family;
  } catch {
    throw new Error("Could not resolve the webhook host");
  }
  if ((isIPv4(address) && isPrivateIpv4(address)) || (isIPv6(address) && isPrivateIpv6(address))) {
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
