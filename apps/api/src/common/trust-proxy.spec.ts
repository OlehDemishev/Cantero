import { resolveTrustProxyHops, warnOnceIfProxiedButUntrusted } from "./trust-proxy";

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

describe("warnOnceIfProxiedButUntrusted", () => {
  it("warns once the first time a request arrives through a proxy, and always calls next", () => {
    const warn = jest.fn();
    const next = jest.fn();
    const middleware = warnOnceIfProxiedButUntrusted(warn);

    middleware({ headers: {} }, {}, next);
    expect(warn).not.toHaveBeenCalled();

    middleware({ headers: { "x-forwarded-for": "203.0.113.7" } }, {}, next);
    middleware({ headers: { "x-forwarded-for": "203.0.113.8" } }, {}, next);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/TRUST_PROXY_HOPS/);
    expect(next).toHaveBeenCalledTimes(3);
  });
});
