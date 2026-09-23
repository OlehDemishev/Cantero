import { test } from "node:test";
import assert from "node:assert/strict";
import { PluralRulesForTests as Polyfill } from "./intl-plural-rules.ts";

// Node has full ICU data, so its own Intl.PluralRules is the reference the polyfill must match.
const NUMBERS = [
  ...Array.from({ length: 2001 }, (_, i) => i),
  0.5, 1.5, 2.25, 1.0001, 11.1, 1_000_000, 2_000_000, 1_000_001, 3_000_000,
];

for (const locale of ["en", "de", "es", "pl", "uk"]) {
  test(`cardinal plurals match ICU for ${locale}`, () => {
    const ours = new Polyfill(locale);
    const icu = new Intl.PluralRules(locale);
    for (const n of NUMBERS) assert.equal(ours.select(n), icu.select(n), `${locale} ${n}`);
    assert.deepEqual([...ours.resolvedOptions().pluralCategories].sort(), [...icu.resolvedOptions().pluralCategories].sort());
  });
}

test("English ordinals match ICU", () => {
  const ours = new Polyfill("en-US", { type: "ordinal" });
  const icu = new Intl.PluralRules("en-US", { type: "ordinal" });
  for (const n of NUMBERS.filter(Number.isInteger)) assert.equal(ours.select(n), icu.select(n), `${n}`);
});

test("a region subtag or an unsupported locale still resolves", () => {
  assert.equal(new Polyfill("de-AT").select(1), "one");
  assert.equal(new Polyfill(["fr", "pl"]).select(3), "few");
  assert.equal(new Polyfill("ja").select(1), "one");
  assert.deepEqual(Polyfill.supportedLocalesOf(["uk-UA", "ja"]), ["uk-UA"]);
});
