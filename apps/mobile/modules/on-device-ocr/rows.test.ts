// Run: node --experimental-strip-types --test modules/on-device-ocr/rows.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { linesToText, type OcrLine } from "./rows.ts";

const line = (text: string, x: number, y: number, height = 0.02): OcrLine => ({ text, x, y, width: 0.2, height, confidence: 1 });

test("joins a label and its amount printed at opposite edges into one row", () => {
  // Vision / ML Kit report these as separate observations, in no particular order.
  const lines = [line("3,50", 0.8, 0.401), line("Kaffee", 0.05, 0.35), line("SUMME EUR", 0.05, 0.4, 0.025), line("2,60", 0.82, 0.351), line("Bäckerei Müller", 0.3, 0.05, 0.04)];
  assert.equal(linesToText(lines), "Bäckerei Müller\nKaffee 2,60\nSUMME EUR 3,50");
});

test("keeps close but separate rows apart", () => {
  const lines = [line("Zwischensumme 3,50", 0.05, 0.4), line("SUMME 3,50", 0.05, 0.425), line("MwSt 0,56", 0.05, 0.45)];
  assert.deepEqual(linesToText(lines).split("\n"), ["Zwischensumme 3,50", "SUMME 3,50", "MwSt 0,56"]);
});

test("skips empty pieces", () => {
  assert.equal(linesToText([line("  ", 0, 0), line("Total 5,00", 0, 0.1)]), "Total 5,00");
});
