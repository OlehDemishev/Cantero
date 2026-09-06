import { BadRequestException } from "@nestjs/common";
import { assertPublicWebhookUrl } from "./webhook-url";

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
