import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
import { BadRequestException } from "@nestjs/common";

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
}

/**
 * Rejects webhook URLs that would make the server call itself or reach into the private
 * network (SSRF) — checked at create/update time by resolving the hostname, not re-checked
 * on every delivery (that would need to defend against DNS rebinding, out of scope here).
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
