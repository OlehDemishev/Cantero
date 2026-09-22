import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { PageText, PageWord } from "./pdf-text";
import { disciplineFor, findSheetReferences, looksLikeSheetNumber, recognizeSheet, sheetKey } from "./sheet-recognition";

const word = (text: string, x: number, y: number, size = 0.01): PageWord => ({ text, x, y, width: text.length * size * 0.6, height: size, size });

/** Filler text spread over the drawing area, so "the biggest text" means something. */
const notes = Array.from({ length: 30 }, (_, i) => word(`note${i}`, 0.05 + (i % 6) * 0.1, 0.1 + Math.floor(i / 6) * 0.1));

/** A small drawing set the way CAD exports one: a title block bottom right, callouts in the plan. */
export function drawingSetPdf(): Promise<Buffer> {
  return new Promise((resolve) => {
    // No margins: pdfkit otherwise starts a new page for text near the bottom edge.
    const doc = new PDFDocument({ size: "A3", layout: "landscape", autoFirstPage: false, margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const W = 1190.55;
    const H = 841.89;
    const sheet = (opts: { numberLabel: string; number: string; titleLabel: string; title: string; body: string[] }) => {
      doc.addPage({ size: "A3", layout: "landscape", margin: 0 });
      doc.font("Helvetica").fontSize(9);
      opts.body.forEach((line, i) => doc.text(line, 80, 90 + i * 40));
      doc.rect(W - 330, H - 190, 300, 160).stroke();
      doc.fontSize(7).text("PROJECT", W - 320, H - 180).fontSize(9).text("Tower A, Berlin", W - 320, H - 170);
      doc.fontSize(7).text(opts.titleLabel, W - 320, H - 145).fontSize(10).text(opts.title, W - 320, H - 135);
      doc.fontSize(7).text("SCALE", W - 320, H - 105).fontSize(9).text("1:100", W - 320, H - 95);
      doc.fontSize(7).text(opts.numberLabel, W - 160, H - 105).fontSize(22).text(opts.number, W - 160, H - 93);
    };
    sheet({ numberLabel: "SHEET NO.", number: "A-101", titleLabel: "SHEET TITLE", title: "GROUND FLOOR PLAN", body: ["GENERAL NOTES: see A-501 for wall types", "5/A-501", "SEE S-201 FOR FOUNDATIONS", "DN100 drain, bolts M20, paper A1"] });
    sheet({ numberLabel: "SHEET NO.", number: "A-501", titleLabel: "SHEET TITLE", title: "WALL SECTIONS AND DETAILS", body: ["Details 1-8", "back to plan A-101"] });
    sheet({ numberLabel: "Plan-Nr.:", number: "EG-01", titleLabel: "Planinhalt", title: "Grundriss Erdgeschoss", body: ["Schnitt siehe SN-01", "Oberkante OK+2.50"] });
    doc.addPage({ size: "A3", layout: "landscape", margin: 0 }); // a scanned page: no text at all
    doc.end();
  });
}

describe("sheet number recognition", () => {
  it.each(["A-101", "A101", "S2.01", "FP-101", "M-1.1", "EG-01", "A-EG-001", "E-001B", "(A-201)"])("%s looks like a sheet number", (t) => {
    expect(looksLikeSheetNumber(t)).toBe(true);
  });

  it.each(["DN100", "M", "M20", "C30", "T12", "1:100", "A1", "B2", "NTS", "OK+2.50", "2026-09-21", "REV3", "H-2", "Tower"])("%s doesn't", (t) => {
    expect(looksLikeSheetNumber(t)).toBe(false);
  });

  it("keys sheet numbers so spelling variants match", () => {
    expect(sheetKey("A-2.01")).toBe(sheetKey("a 201"));
    expect(sheetKey("A-201")).toBe("A201");
  });

  it("maps standard discipline designators and leaves German plan prefixes alone", () => {
    expect(disciplineFor("A-101")).toBe("Architectural");
    expect(disciplineFor("S2.01")).toBe("Structural");
    expect(disciplineFor("FP-101")).toBe("Fire Protection");
    expect(disciplineFor("EG-01")).toBeNull();
  });

  it("takes the number next to a sheet-number label with high confidence, over a bigger number elsewhere", () => {
    const words = [...notes, word("A-900", 0.3, 0.3, 0.03), word("SHEET", 0.8, 0.88, 0.006), word("NO.", 0.83, 0.88, 0.006), word("A-101", 0.8, 0.9, 0.02)];
    expect(recognizeSheet(words)).toMatchObject({ sheetNumber: "A-101", confidence: "high", discipline: "Architectural" });
  });

  it("falls back to the big number in the title block corner with medium confidence", () => {
    const words = [...notes, word("see", 0.1, 0.5), word("S-201", 0.13, 0.5), word("A-102", 0.85, 0.92, 0.025)];
    expect(recognizeSheet(words)).toMatchObject({ sheetNumber: "A-102", confidence: "medium" });
  });

  it("leaves a page blank rather than guessing from a callout in the middle of the drawing", () => {
    expect(recognizeSheet([...notes, word("S-201", 0.4, 0.4)])).toEqual({ sheetNumber: null, title: null, discipline: null, confidence: null });
    expect(recognizeSheet([])).toMatchObject({ sheetNumber: null });
  });

  it("finds callouts and bare references, skipping the page's own number", () => {
    const words = [word("5/A-501", 0.2, 0.3), word("SEE", 0.2, 0.4), word("S-201", 0.24, 0.4), word("A-101", 0.85, 0.9, 0.02)];
    const refs = findSheetReferences(words, "A-101");
    expect(refs.map((r) => r.label)).toEqual(["A-501", "S-201"]);
    // The callout's box covers "A-501", not the detail number before the slash.
    expect(refs[0].x).toBeGreaterThan(0.2);
    expect(refs[0].x + refs[0].width).toBeCloseTo(words[0].x + words[0].width, 5);
  });
});

/**
 * Runs the real, unmocked extractPdfText in a plain Node process: pdfjs-dist is ESM-only and
 * Jest's module runtime can't load it, but Node itself can (see pdf-text.ts). Mocking pdf.js here
 * would test nothing — recognition stands or falls on what the real text layer looks like.
 */
function extractInNode(pdf: Buffer): PageText[] {
  const file = join(mkdtempSync(join(tmpdir(), "drawing-set-")), "set.pdf");
  writeFileSync(file, pdf);
  const script = `require(${JSON.stringify(join(__dirname, "pdf-text.ts"))}).extractPdfText(require("fs").readFileSync(${JSON.stringify(file)})).then((p) => process.stdout.write(JSON.stringify(p)))`;
  const out = execFileSync(process.execPath, ["-r", "ts-node/register/transpile-only", "-e", script], {
    cwd: join(__dirname, "../.."),
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(out) as PageText[];
}

describe("on a real PDF (pdf.js unmocked)", () => {
  let pages: PageText[];
  beforeAll(async () => {
    pages = extractInNode(await drawingSetPdf());
  }, 60_000);

  it("reads words with page-relative positions", () => {
    expect(pages).toHaveLength(4);
    const number = pages[0].words.find((w) => w.text === "A-101" && w.size > 0.015)!;
    expect(number.x).toBeGreaterThan(0.8);
    expect(number.y).toBeGreaterThan(0.85);
    expect(pages[0].width).toBeCloseTo(1190.55, 0);
  });

  it("recognizes each sheet, including a German title block", () => {
    const guesses = pages.map((p) => recognizeSheet(p.words));
    expect(guesses[0]).toMatchObject({ sheetNumber: "A-101", title: "GROUND FLOOR PLAN", discipline: "Architectural", confidence: "high" });
    expect(guesses[1]).toMatchObject({ sheetNumber: "A-501", title: "WALL SECTIONS AND DETAILS", confidence: "high" });
    expect(guesses[2]).toMatchObject({ sheetNumber: "EG-01", title: "Grundriss Erdgeschoss", discipline: null, confidence: "high" });
    expect(guesses[3]).toMatchObject({ sheetNumber: null });
  });

  it("finds the references each sheet prints", () => {
    expect(findSheetReferences(pages[0].words, "A-101").map((r) => r.label)).toEqual(["A-501", "A-501", "S-201"]);
    expect(findSheetReferences(pages[1].words, "A-501").map((r) => r.label)).toEqual(["A-101"]);
    expect(findSheetReferences(pages[2].words, "EG-01").map((r) => r.label)).toEqual(["SN-01"]);
  });
});
