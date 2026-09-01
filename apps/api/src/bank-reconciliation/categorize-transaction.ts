export interface CategorizationRule {
  id: string;
  pattern: string;
  category: string;
}

/**
 * First rule (in the given order — callers pass rules oldest-first, so an earlier-created rule
 * wins over a later, more general one) whose pattern appears as a case-insensitive substring of
 * the transaction description. Returns null when nothing matches, not an error — most
 * transactions won't hit a rule, and that's the expected common case, not a failure.
 */
export function categorizeDescription<T extends CategorizationRule>(description: string, rules: T[]): T | null {
  const normalized = description.toLowerCase();
  return rules.find((rule) => rule.pattern && normalized.includes(rule.pattern.toLowerCase())) ?? null;
}
