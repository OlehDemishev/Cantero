import { changeOrderSentEmail, estimateSentEmail, invoiceSentEmail } from "./client-mail-templates";

const XSS_NAME = `<img src=x onerror=alert(1)>`;
const XSS_ESCAPED = `&lt;img src=x onerror=alert(1)&gt;`;

describe("client-mail-templates XSS safety", () => {
  it("invoiceSentEmail escapes an attacker-controlled company name in html but not in text/subject", () => {
    const email = invoiceSentEmail("en", XSS_NAME, "INV-0001", "100.00", "USD");

    expect(email.html).not.toContain(XSS_NAME);
    expect(email.html).toContain(XSS_ESCAPED);
    // subject/text are plain text, never rendered as HTML — the raw name belongs there unescaped.
    expect(email.subject).toContain(XSS_NAME);
    expect(email.text).toContain(XSS_NAME);
  });

  it("estimateSentEmail escapes both company name and estimate name in html", () => {
    const email = estimateSentEmail("en", XSS_NAME, XSS_NAME, "https://example.com/e/token");

    expect(email.html).not.toContain(XSS_NAME);
    expect(email.html.split(XSS_ESCAPED).length - 1).toBe(2);
  });

  it("changeOrderSentEmail escapes both company name and title in html", () => {
    const email = changeOrderSentEmail("en", XSS_NAME, 7, XSS_NAME, "https://example.com/co/token");

    expect(email.html).not.toContain(XSS_NAME);
    expect(email.html.split(XSS_ESCAPED).length - 1).toBe(2);
  });

  it("does not double-escape or corrupt an ordinary company name", () => {
    const email = invoiceSentEmail("en", "Acme Construction GmbH", "INV-0001", "100.00", "USD");
    expect(email.html).toContain("Acme Construction GmbH has sent you invoice");
  });

  it("escapes consistently across every non-English locale too", () => {
    for (const locale of ["de", "es", "pl", "uk"] as const) {
      const email = invoiceSentEmail(locale, XSS_NAME, "INV-0001", "100.00", "USD");
      expect(email.html).not.toContain(XSS_NAME);
      expect(email.html).toContain(XSS_ESCAPED);
    }
  });
});
