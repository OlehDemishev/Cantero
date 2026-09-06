/** Escapes the 5 characters that matter for safely interpolating a plain string into an HTML
 * document — use for any tenant/user-controlled text (a company name, a title) that ends up
 * inside an `html:` email body or similar generated markup instead of a real templating engine. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
