const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/** Substitutes {{name}} tokens with matching values from vars; a token with no matching key is
 * left as-is rather than silently dropped, so a typo'd placeholder is visible in the sent message. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(PLACEHOLDER_PATTERN, (match, key: string) => (key in vars ? vars[key] : match));
}

export function extractPlaceholders(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER_PATTERN)) found.add(match[1]);
  return [...found];
}

/** Placeholders used in body that aren't in allowedPlaceholders — empty means the body is valid. */
export function findUnknownPlaceholders(body: string, allowedPlaceholders: readonly string[]): string[] {
  return extractPlaceholders(body).filter((p) => !allowedPlaceholders.includes(p));
}
