import { securityHeaders } from "./security-headers";

function run(path: string, production = false) {
  const headers: Record<string, string> = {};
  const res = { setHeader: (name: string, value: string) => (headers[name] = value) };
  const next = jest.fn();
  securityHeaders({ production })({ path } as never, res as never, next);
  expect(next).toHaveBeenCalled();
  return headers;
}

describe("securityHeaders", () => {
  it("locks every API response down", () => {
    const h = run("/api/invoices");
    expect(h).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    });
    expect(h).not.toHaveProperty("Strict-Transport-Security");
  });

  it("leaves the public API docs page free to run its scripts", () => {
    expect(run("/api/docs")).not.toHaveProperty("Content-Security-Policy");
    expect(run("/api/docs/swagger-ui.css")).not.toHaveProperty("Content-Security-Policy");
  });

  it("adds HSTS in production", () => {
    expect(run("/api/me", true)["Strict-Transport-Security"]).toMatch(/max-age=63072000/);
  });
});
