import { escapeHtml } from "../escape-html";

/** Markup that's already safe to put in an email body as is — what html`` returns. */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

function render(value: unknown): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(String(value));
}

/**
 * Tagged template for email HTML: every interpolated value is escaped — a company name, a contract
 * title, a message template's body — unless it's itself html`` output (so fragments nest) or an
 * array of such fragments (table rows). Without this, whoever names a company or a report could
 * put their own markup and links into mail Cantero sends from its own domain.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0];
  values.forEach((value, i) => {
    out += render(value) + strings[i + 1];
  });
  return new SafeHtml(out);
}

/** Plain text shown with its line breaks — escaped, then each newline as <br>. */
export function multiline(text: string): SafeHtml {
  return new SafeHtml(escapeHtml(text).replace(/\r?\n/g, "<br>"));
}
