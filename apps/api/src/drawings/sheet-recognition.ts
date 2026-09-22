import type { PageWord } from "./pdf-text";

/**
 * Reads a drawing's own sheet number and title from the words on its page, and finds the
 * references it prints to other sheets. Heuristic by nature — a drawing set has no machine-readable
 * "this is the sheet number" field — so every guess is shown to a person for review before any
 * sheet is created, and a page nothing convincing turns up on is left blank rather than guessed.
 *
 * What it leans on, strongest first: a title-block label next to the number ("SHEET NO.",
 * "DWG NO", "Plan-Nr.", "Blatt"…), the title block's usual bottom-right position, and the number
 * usually being the biggest text there.
 */

/**
 * A sheet number: a discipline/plan prefix of letters, then digits, optionally dotted or dashed
 * further ("A-101", "A101", "S2.01", "FP-101", "M-1.1", "EG-01", "A-EG-001", "E-001B").
 */
const SHEET_NUMBER = /^[A-Z]{1,4}(?:[-.][A-Z]{1,4})?[-.]?\d{1,4}(?:[.-]\d{1,4}){0,2}[A-Z]?$/;

/** Words that look like sheet numbers but, printed on a drawing, almost never are. */
const NOT_SHEET_NUMBERS = /^(?:DN|PN|NW|RC|OK|UK|FF|FFL|EL|NTS|REV|NO|NR|DIN|ISO|EN|IP|PT|H|W|L|T|D)[-.]?\d/;
/** Paper sizes: "A1" on a title block is the format, not a sheet. */
const PAPER_SIZE = /^[AB][0-4]$/;
/** Letters run straight into a short number ("M20" bolts, "C30" concrete, "T12" rebar): real
 * sheet numbers without a separator have at least three digits ("A101", "E001B"). */
const SHORT_UNSEPARATED = /^[A-Z]{1,4}\d{1,2}[A-Z]?$/;

const NUMBER_LABELS = [
  /^sheet$/i,
  /^sheet\s*(?:no\.?|nr\.?|number|#)$/i,
  /^(?:dwg|drawing)\.?\s*(?:no\.?|number|#)$/i,
  /^plan[-\s]?(?:nr\.?|nummer)$/i,
  /^plannummer$/i,
  /^blatt(?:[-\s]?nr\.?)?$/i,
  /^zeichnungs?[-\s]?(?:nr\.?|nummer)$/i,
  /^zeichnungsnummer$/i,
];
const TITLE_LABELS = [/^(?:sheet|drawing)\s+title$/i, /^title$/i, /^planinhalt$/i, /^plantitel$/i, /^planbezeichnung$/i, /^bezeichnung$/i, /^inhalt$/i, /^titel$/i];
/** Other title-block fields; a title read under its label stops at the next of these. */
const OTHER_LABELS = /^(?:scale|date|drawn|checked|approved|project|client|revision|rev\.?|job|maßstab|massstab|datum|gezeichnet|geprüft|bauherr|projekt|index|format)[:.]?$/i;

/** US National CAD Standard discipline designators, by sheet-number prefix. */
const DISCIPLINES: Record<string, string> = {
  FP: "Fire Protection",
  FA: "Fire Alarm",
  G: "General",
  H: "Hazardous Materials",
  V: "Survey",
  B: "Geotechnical",
  C: "Civil",
  L: "Landscape",
  S: "Structural",
  A: "Architectural",
  I: "Interiors",
  Q: "Equipment",
  F: "Fire Protection",
  P: "Plumbing",
  D: "Process",
  M: "Mechanical",
  E: "Electrical",
  W: "Distributed Energy",
  T: "Telecommunications",
  R: "Resource",
  Z: "Contractor / Shop Drawings",
};

export type Confidence = "high" | "medium";

export interface SheetGuess {
  sheetNumber: string | null;
  title: string | null;
  discipline: string | null;
  /** "high": found next to a sheet-number label. "medium": position and size only. */
  confidence: Confidence | null;
}

export interface SheetReference {
  label: string;
  targetKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** "A-2.01", "a 201" and "A201" all refer to the same sheet. */
export function sheetKey(sheetNumber: string): string {
  return sheetNumber.toUpperCase().replace(/[\s._-]/g, "");
}

function clean(text: string): string {
  return text.replace(/^[([{"'«„]+|[)\]}"'»“:;,]+$/g, "");
}

export function looksLikeSheetNumber(text: string): boolean {
  const t = clean(text);
  return SHEET_NUMBER.test(t) && !NOT_SHEET_NUMBERS.test(t) && !PAPER_SIZE.test(t) && !SHORT_UNSEPARATED.test(t);
}

/** Only a designator the standard defines: "EG-01" (Erdgeschoss) must not become Electrical. */
export function disciplineFor(sheetNumber: string): string | null {
  const m = /^([A-Z]{1,2})(?=[-.\d])/.exec(sheetNumber.toUpperCase());
  return m ? (DISCIPLINES[m[1]] ?? null) : null;
}

const centerY = (w: PageWord) => w.y + w.height / 2;
const lineHeight = (a: PageWord, b: PageWord) => Math.max(a.height, b.height, 0.004);
const sameLine = (a: PageWord, b: PageWord) => Math.abs(centerY(a) - centerY(b)) < lineHeight(a, b) * 0.6;

/** Label phrases ("SHEET NO.", "Plan-Nr.") as one box, joining up to three words on a line. */
function findLabels(words: PageWord[], patterns: RegExp[]): PageWord[] {
  const found: PageWord[] = [];
  for (let i = 0; i < words.length; i++) {
    let phrase = words[i];
    for (let n = 0; n < 3 && i + n < words.length; n++) {
      if (n > 0) {
        const next = words[i + n];
        if (!sameLine(phrase, next) || next.x < phrase.x) break;
        const right = Math.max(phrase.x + phrase.width, next.x + next.width);
        const top = Math.min(phrase.y, next.y);
        phrase = { ...phrase, text: `${phrase.text} ${next.text}`, width: right - phrase.x, y: top, height: Math.max(phrase.y + phrase.height, next.y + next.height) - top };
      }
      const text = phrase.text.replace(/:$/, "");
      if (patterns.some((p) => p.test(text))) {
        found.push(phrase);
        break;
      }
    }
  }
  return found;
}

/** Is `w` the value belonging to `label`: to its right on the same line, or just below it. */
function belongsTo(w: PageWord, label: PageWord): boolean {
  if (sameLine(w, label)) return w.x >= label.x + label.width * 0.9 && w.x - (label.x + label.width) < 0.2;
  const gap = w.y - (label.y + label.height);
  const overlaps = w.x < label.x + label.width + 0.05 && w.x + w.width > label.x - 0.05;
  return gap >= -label.height * 0.3 && gap < lineHeight(w, label) * 4 && overlaps;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const MIN_SCORE = 4;

export function recognizeSheet(words: PageWord[]): SheetGuess {
  const none: SheetGuess = { sheetNumber: null, title: null, discipline: null, confidence: null };
  if (words.length === 0) return none;

  const labels = findLabels(words, NUMBER_LABELS);
  const typical = median(words.map((w) => w.size)) || 1;

  let best: { word: PageWord; text: string; score: number; labelled: boolean } | null = null;
  for (const word of words) {
    const text = clean(word.text);
    if (!looksLikeSheetNumber(text)) continue;
    const labelled = labels.some((l) => belongsTo(word, l));
    let score = labelled ? 6 : 0;
    if (word.x >= 0.6 && word.y >= 0.6) score += 3;
    else if (word.x >= 0.75) score += 2;
    else if (word.y >= 0.85) score += 1;
    const ratio = word.size / typical;
    score += ratio >= 1.8 ? 3 : ratio >= 1.3 ? 2 : ratio >= 1.1 ? 1 : 0;
    const better =
      !best ||
      score > best.score ||
      (score === best.score && (word.size > best.word.size || (word.size === best.word.size && word.x + word.y > best.word.x + best.word.y)));
    if (better) best = { word, text, score, labelled };
  }
  if (!best || best.score < MIN_SCORE) return none;

  const sheetNumber = best.text.toUpperCase();
  return {
    sheetNumber,
    title: recognizeTitle(words),
    discipline: disciplineFor(sheetNumber),
    confidence: best.labelled ? "high" : "medium",
  };
}

/** The words under (or beside) a title label, line by line, until another title-block field. */
function recognizeTitle(words: PageWord[]): string | null {
  const label = findLabels(words, TITLE_LABELS)[0];
  if (!label) return null;
  const labelWords = new Set(label.text.split(" "));
  const isLabelWord = (w: PageWord) => sameLine(w, label) && labelWords.has(w.text);
  const picked = new Set(words.filter((w) => w !== label && belongsTo(w, label) && !isLabelWord(w)));
  // A title line runs on past the label's column: follow each picked line rightwards while the
  // words stay close together.
  for (const start of [...picked]) {
    let right = start.x + start.width;
    const rest = words.filter((w) => sameLine(w, start) && w.x >= right - 1e-6).sort((a, b) => a.x - b.x);
    for (const w of rest) {
      if (w.x - right > w.height * 3) break;
      if (!isLabelWord(w)) picked.add(w);
      right = w.x + w.width;
    }
  }
  const candidates = [...picked].sort((a, b) => (sameLine(a, b) ? a.x - b.x : a.y - b.y));
  const out: string[] = [];
  for (const w of candidates) {
    if (OTHER_LABELS.test(w.text) || NUMBER_LABELS.some((p) => p.test(w.text))) break;
    out.push(w.text);
    if (out.length >= 12) break;
  }
  const title = out.join(" ").trim();
  return title ? title.slice(0, 120) : null;
}

/**
 * Every place the page names another sheet: a detail callout "5/A-501" (the part after the
 * slash) or a bare sheet number ("SEE A-201"). The page's own number is skipped. Nothing here
 * checks the target exists — links are resolved against the project's sheets when viewed, so a
 * reference to a sheet uploaded later starts working then, and one to a sheet that never
 * arrives just never shows.
 */
export function findSheetReferences(words: PageWord[], ownSheetNumber: string | null, limit = 500): SheetReference[] {
  const own = ownSheetNumber ? sheetKey(ownSheetNumber) : null;
  const refs: SheetReference[] = [];
  for (const word of words) {
    const raw = clean(word.text);
    const slash = raw.lastIndexOf("/");
    const text = slash >= 0 ? raw.slice(slash + 1) : raw;
    if (!looksLikeSheetNumber(text)) continue;
    const key = sheetKey(text);
    if (key === own) continue;
    // For "5/A-501", box just the sheet part of the word.
    const start = slash >= 0 ? word.text.indexOf(text) : 0;
    const share = word.text.length > 0 ? word.width / word.text.length : 0;
    refs.push({
      label: text.toUpperCase(),
      targetKey: key,
      x: word.x + Math.max(0, start) * share,
      y: word.y,
      width: slash >= 0 ? text.length * share : word.width,
      height: word.height,
    });
    if (refs.length >= limit) break;
  }
  return refs;
}
