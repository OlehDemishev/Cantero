import { resolveTrustProxyHops } from "./trust-proxy";

describe("resolveTrustProxyHops", () => {
  it("defaults to 0 (trust nothing) when unset", () => {
    expect(resolveTrustProxyHops(undefined)).toBe(0);
  });

  it("defaults to 0 for an empty string", () => {
    expect(resolveTrustProxyHops("")).toBe(0);
  });

  it("defaults to 0 for garbage input rather than throwing", () => {
    expect(resolveTrustProxyHops("garbage")).toBe(0);
  });

  it("defaults to 0 for zero or a negative value", () => {
    expect(resolveTrustProxyHops("0")).toBe(0);
    expect(resolveTrustProxyHops("-1")).toBe(0);
  });

  it("defaults to 0 for a non-integer value", () => {
    expect(resolveTrustProxyHops("1.5")).toBe(0);
  });

  it("returns the parsed number of hops for a positive integer", () => {
    expect(resolveTrustProxyHops("1")).toBe(1);
    expect(resolveTrustProxyHops("2")).toBe(2);
  });
});
