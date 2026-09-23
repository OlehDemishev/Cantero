/**
 * Hermes ships Intl.NumberFormat and DateTimeFormat but not Intl.PluralRules, which use-intl needs
 * for every "{n, plural, one {…} other {…}}" message — without it those render as their raw key
 * ("plans.summary") and log FORMATTING_ERROR. This fills it in for the app's five languages with the
 * CLDR cardinal rules (and English ordinals), rather than pulling in a polyfill with data for every
 * locale on earth. Imported for its side effect before anything formats a message.
 */

type Category = "zero" | "one" | "two" | "few" | "many" | "other";
type Type = "cardinal" | "ordinal";

/** CLDR operands: i = integer digits, v = number of visible fraction digits — after rounding to
 * three fraction digits, as ICU's PluralRules does by default (1.0001 counts as 1). */
function operands(n: number) {
  const abs = Number(Math.abs(n).toFixed(3));
  const text = String(abs);
  const dot = text.indexOf(".");
  return { n: abs, i: Math.floor(abs), v: dot === -1 ? 0 : text.length - dot - 1 };
}

const between = (x: number, from: number, to: number) => x >= from && x <= to;

const CARDINAL: Record<string, { categories: Category[]; select: (n: number) => Category }> = {
  en: { categories: ["one", "other"], select: (x) => (operands(x).i === 1 && operands(x).v === 0 ? "one" : "other") },
  de: { categories: ["one", "other"], select: (x) => (operands(x).i === 1 && operands(x).v === 0 ? "one" : "other") },
  es: {
    categories: ["one", "many", "other"],
    select: (x) => {
      const { n, i, v } = operands(x);
      if (n === 1) return "one";
      if (i !== 0 && i % 1_000_000 === 0 && v === 0) return "many";
      return "other";
    },
  },
  pl: {
    categories: ["one", "few", "many", "other"],
    select: (x) => {
      const { i, v } = operands(x);
      if (v !== 0) return "other";
      if (i === 1) return "one";
      if (between(i % 10, 2, 4) && !between(i % 100, 12, 14)) return "few";
      return "many";
    },
  },
  uk: {
    categories: ["one", "few", "many", "other"],
    select: (x) => {
      const { i, v } = operands(x);
      if (v !== 0) return "other";
      if (i % 10 === 1 && i % 100 !== 11) return "one";
      if (between(i % 10, 2, 4) && !between(i % 100, 12, 14)) return "few";
      return "many";
    },
  },
};

const ORDINAL_EN = (x: number): Category => {
  const n = Math.abs(x);
  if (n % 10 === 1 && n % 100 !== 11) return "one";
  if (n % 10 === 2 && n % 100 !== 12) return "two";
  if (n % 10 === 3 && n % 100 !== 13) return "few";
  return "other";
};

const language = (locale: string | undefined) => (locale ?? "en").toLowerCase().split(/[-_]/)[0];
const supported = (locale: string) => language(locale) in CARDINAL;

class PluralRules {
  private readonly locale: string;
  private readonly type: Type;

  constructor(locales?: string | string[], options?: { type?: Type }) {
    const requested = (Array.isArray(locales) ? locales : locales ? [locales] : []).find(supported);
    this.locale = requested ? language(requested) : "en";
    this.type = options?.type ?? "cardinal";
  }

  select(n: number): Category {
    if (!Number.isFinite(n)) return "other";
    if (this.type === "ordinal") return this.locale === "en" ? ORDINAL_EN(n) : "other";
    return CARDINAL[this.locale].select(n);
  }

  resolvedOptions() {
    const pluralCategories = this.type === "ordinal" ? (this.locale === "en" ? ["one", "two", "few", "other"] : ["other"]) : CARDINAL[this.locale].categories;
    return { locale: this.locale, type: this.type, pluralCategories, minimumIntegerDigits: 1, minimumFractionDigits: 0, maximumFractionDigits: 3 };
  }

  static supportedLocalesOf(locales?: string | string[]): string[] {
    return (Array.isArray(locales) ? locales : locales ? [locales] : []).filter(supported);
  }
}

if (typeof Intl !== "undefined" && typeof (Intl as { PluralRules?: unknown }).PluralRules === "undefined") {
  (Intl as unknown as { PluralRules: typeof PluralRules }).PluralRules = PluralRules;
}

export { PluralRules as PluralRulesForTests };
