import { BadRequestException } from "@nestjs/common";
import { Agent } from "undici";
import { assertPublicWebhookUrl, isBlockedAddress, parseIpv6, resolvePinnedWebhookDispatcher } from "./webhook-url";

jest.mock("node:dns/promises", () => ({ lookup: jest.fn() }));
const lookup = jest.requireMock("node:dns/promises").lookup as jest.Mock;

describe("assertPublicWebhookUrl", () => {
  beforeEach(() => {
    lookup.mockReset();
  });

  it("rejects a malformed URL", async () => {
    await expect(assertPublicWebhookUrl("not a url")).rejects.toThrow(BadRequestException);
  });

  it("rejects a non-http(s) protocol", async () => {
    await expect(assertPublicWebhookUrl("ftp://example.com/hook")).rejects.toThrow(BadRequestException);
  });

  it("rejects localhost outright without a DNS lookup", async () => {
    await expect(assertPublicWebhookUrl("http://localhost/hook")).rejects.toThrow(BadRequestException);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects when the hostname fails to resolve", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertPublicWebhookUrl("https://nonexistent.example/hook")).rejects.toThrow(BadRequestException);
  });

  it.each([
    ["10.x private range", "10.0.0.5"],
    ["172.16-31.x private range", "172.20.0.1"],
    ["192.168.x private range", "192.168.1.1"],
    ["loopback", "127.0.0.1"],
    ["link-local / cloud metadata", "169.254.169.254"],
    ["unspecified", "0.0.0.0"],
  ])("rejects a hostname resolving to a private IPv4 address (%s)", async (_label, ip) => {
    lookup.mockResolvedValue({ address: ip, family: 4 });
    await expect(assertPublicWebhookUrl("https://sneaky.example/hook")).rejects.toThrow(BadRequestException);
  });

  it("rejects a hostname resolving to a private IPv6 address", async () => {
    lookup.mockResolvedValue({ address: "fd00::1", family: 6 });
    await expect(assertPublicWebhookUrl("https://sneaky.example/hook")).rejects.toThrow(BadRequestException);
  });

  it("rejects the IPv6 loopback address", async () => {
    lookup.mockResolvedValue({ address: "::1", family: 6 });
    await expect(assertPublicWebhookUrl("https://sneaky.example/hook")).rejects.toThrow(BadRequestException);
  });

  it("allows a hostname resolving to a public IPv4 address", async () => {
    lookup.mockResolvedValue({ address: "203.0.113.42", family: 4 });
    await expect(assertPublicWebhookUrl("https://hooks.slack.com/services/x")).resolves.toBeUndefined();
  });

  it("allows a hostname resolving to a public IPv6 address", async () => {
    lookup.mockResolvedValue({ address: "2606:4700:4700::1111", family: 6 });
    await expect(assertPublicWebhookUrl("https://hooks.slack.com/services/x")).resolves.toBeUndefined();
  });
});

describe("resolvePinnedWebhookDispatcher", () => {
  beforeEach(() => {
    lookup.mockReset();
  });

  it("rejects localhost outright without a DNS lookup", async () => {
    await expect(resolvePinnedWebhookDispatcher("http://localhost/hook")).rejects.toThrow("localhost");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects when the hostname fails to resolve", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(resolvePinnedWebhookDispatcher("https://nonexistent.example/hook")).rejects.toThrow("Could not resolve");
  });

  it("rejects a hostname that resolves to a private IPv4 address — e.g. rebound since the webhook was registered", async () => {
    lookup.mockResolvedValue({ address: "169.254.169.254", family: 4 });
    await expect(resolvePinnedWebhookDispatcher("https://sneaky.example/hook")).rejects.toThrow("private or internal");
  });

  it("rejects a hostname that resolves to a private IPv6 address", async () => {
    lookup.mockResolvedValue({ address: "fd00::1", family: 6 });
    await expect(resolvePinnedWebhookDispatcher("https://sneaky.example/hook")).rejects.toThrow("private or internal");
  });

  it("re-resolves on every call rather than caching — two calls make two lookups", async () => {
    lookup.mockResolvedValue({ address: "203.0.113.42", family: 4 });
    await resolvePinnedWebhookDispatcher("https://hooks.example/hook");
    await resolvePinnedWebhookDispatcher("https://hooks.example/hook");
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("returns a dispatcher pinned to the resolved public address, without throwing", async () => {
    lookup.mockResolvedValue({ address: "203.0.113.42", family: 4 });
    const dispatcher = await resolvePinnedWebhookDispatcher("https://hooks.example/hook");
    expect(dispatcher).toBeInstanceOf(Agent);
  });
});

describe("isBlockedAddress", () => {
  it.each([
    ["0.0.0.0/8 this-network", "0.1.2.3"],
    ["10/8 private", "10.255.0.1"],
    ["100.64/10 carrier-grade NAT", "100.64.0.1"],
    ["100.64/10 upper end", "100.127.255.254"],
    ["127/8 loopback", "127.8.8.8"],
    ["169.254/16 link-local", "169.254.169.254"],
    ["172.16/12 private", "172.31.255.255"],
    ["192.0.0/24 IETF", "192.0.0.170"],
    ["192.168/16 private", "192.168.0.1"],
    ["198.18/15 benchmarking", "198.19.255.1"],
    ["224/4 multicast", "239.255.255.250"],
    ["240/4 reserved", "240.0.0.1"],
    ["broadcast", "255.255.255.255"],
  ])("blocks IPv4 %s", (_label, ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    ["unspecified", "::"],
    ["loopback", "::1"],
    ["IPv4-compatible", "::a9fe:a9fe"],
    ["unique local fc00::/7", "fc00::1"],
    ["unique local fd", "fd12:3456::1"],
    ["link-local fe80::/10", "fe80::1%eth0"],
    ["link-local upper", "febf::1"],
    ["site-local fec0::/10", "fec0::1"],
    ["multicast", "ff02::1"],
    ["IPv4-mapped metadata", "::ffff:169.254.169.254"],
    ["IPv4-mapped hex form", "::ffff:a9fe:a9fe"],
    ["IPv4-mapped loopback, expanded", "0:0:0:0:0:ffff:7f00:1"],
    ["IPv4-mapped CGNAT", "::ffff:100.64.0.1"],
    ["IPv4-translated", "::ffff:0:10.0.0.1"],
    ["NAT64 to metadata", "64:ff9b::169.254.169.254"],
    ["NAT64 local-use to private", "64:ff9b:1::a00:1"],
    ["6to4 to loopback", "2002:7f00:1::1"],
    ["6to4 to private", "2002:c0a8:101::"],
    ["Teredo", "2001:0:4136:e378::1"],
    ["bracketed literal", "[::1]"],
  ])("blocks IPv6 %s", (_label, ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    ["public IPv4", "8.8.8.8"],
    ["just outside 100.64/10", "100.128.0.1"],
    ["just outside 172.16/12", "172.32.0.1"],
    ["just outside 198.18/15", "198.20.0.1"],
    ["public IPv6", "2606:4700:4700::1111"],
    ["IPv4-mapped public", "::ffff:8.8.8.8"],
    ["NAT64 to public", "64:ff9b::808:808"],
    ["6to4 to public", "2002:808:808::1"],
  ])("allows %s", (_label, ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it("treats anything that isn't an IP address as blocked", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
  });

  it("expands IPv6 notation into eight groups", () => {
    expect(parseIpv6("::ffff:1.2.3.4")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
    expect(parseIpv6("2001:db8::1")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6("1.2.3.4")).toBeNull();
  });
});

describe("webhook URL checks against the full blocklist", () => {
  beforeEach(() => lookup.mockReset());

  it.each(["::ffff:169.254.169.254", "::", "100.64.0.1", "fec0::1", "64:ff9b::a9fe:a9fe", "0.0.0.1"])(
    "rejects a hostname resolving to %s at registration and at delivery",
    async (address) => {
      lookup.mockResolvedValue({ address, family: address.includes(":") ? 6 : 4 });
      await expect(assertPublicWebhookUrl("https://sneaky.example/hook")).rejects.toThrow(BadRequestException);
      await expect(resolvePinnedWebhookDispatcher("https://sneaky.example/hook")).rejects.toThrow("private or internal");
    },
  );

  it("looks up an IPv6 literal without its URL brackets", async () => {
    lookup.mockResolvedValue({ address: "::ffff:127.0.0.1", family: 6 });
    await expect(assertPublicWebhookUrl("http://[::ffff:7f00:1]/hook")).rejects.toThrow(BadRequestException);
    expect(lookup).toHaveBeenCalledWith("::ffff:7f00:1");
  });
});
