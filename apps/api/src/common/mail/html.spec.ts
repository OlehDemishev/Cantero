import { html, multiline } from "./html";

describe("html``", () => {
  it("escapes interpolated text", () => {
    const company = `Acme <a href="https://evil.example">verify your account</a>`;
    expect(String(html`<p>${company} invited you</p>`)).toBe(
      "<p>Acme &lt;a href=&quot;https://evil.example&quot;&gt;verify your account&lt;/a&gt; invited you</p>",
    );
  });

  it("keeps nested html`` fragments and arrays of them as markup", () => {
    const rows = ["a<b", "c"].map((v) => html`<tr><td>${v}</td></tr>`);
    const link = "https://app.example.com/x?a=1&b=2";
    expect(String(html`<table>${rows}</table>${link ? html`<a href="${link}">open</a>` : ""}`)).toBe(
      '<table><tr><td>a&lt;b</td></tr><tr><td>c</td></tr></table><a href="https://app.example.com/x?a=1&amp;b=2">open</a>',
    );
  });

  it("renders null/undefined/false as nothing and numbers as text", () => {
    expect(String(html`${null}${undefined}${false}${42}`)).toBe("42");
  });

  it("turns line breaks into <br> after escaping", () => {
    expect(String(multiline("Hi <b>there</b>\nThanks"))).toBe("Hi &lt;b&gt;there&lt;/b&gt;<br>Thanks");
  });
});
