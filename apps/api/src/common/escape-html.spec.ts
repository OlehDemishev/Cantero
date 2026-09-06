import { escapeHtml } from "./escape-html";

describe("escapeHtml", () => {
  it("escapes angle brackets so a script tag can't inject", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes an img onerror attribute payload", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("escapes ampersands, quotes, and apostrophes", () => {
    expect(escapeHtml(`Tom & Jerry's "Construction"`)).toBe("Tom &amp; Jerry&#39;s &quot;Construction&quot;");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("Acme Construction GmbH")).toBe("Acme Construction GmbH");
  });

  it("escapes & before other entities so it doesn't double-escape", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});
