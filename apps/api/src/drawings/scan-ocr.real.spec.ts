import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { PageText } from "./pdf-text";
import { recognizeSheet } from "./sheet-recognition";

/**
 * A scanned sheet: __fixtures__/scanned-a101.pdf is page A-101 of the test drawing set rasterized at
 * ~145 dpi, JPEG quality 60, placed in a PDF as a picture — no text layer, the way a scanner
 * delivers it. The real pdf.js renderer and the real Tesseract (models shipped in the app) run in a
 * plain Node process, as in sheet-recognition.spec.ts, since neither runs under Jest.
 */
describe("sheet numbers on a scanned drawing (real OCR)", () => {
  it("reads the title block of a page with no text layer", () => {
    const script = `
      require(${JSON.stringify(join(__dirname, "pdf-text.ts"))})
        .extractPdfText(require("fs").readFileSync(${JSON.stringify(join(__dirname, "__fixtures__/scanned-a101.pdf"))}), 5, { ocrScans: { maxPages: 5 } })
        .then((p) => process.stdout.write(JSON.stringify(p)));
    `;
    const pages = JSON.parse(
      execFileSync(process.execPath, ["-r", "ts-node/register/transpile-only", "-e", script], {
        cwd: join(__dirname, "../.."),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 120_000,
      }),
    ) as PageText[];

    expect(pages).toHaveLength(1);
    expect(pages[0].fromScan).toBe(true);
    expect(recognizeSheet(pages[0].words)).toMatchObject({ sheetNumber: "A-101", title: "GROUND FLOOR PLAN", discipline: "Architectural" });
    // Positioned on the whole page, where the text layer version puts it.
    const number = pages[0].words.find((w) => w.text === "A-101")!;
    expect(number.x).toBeGreaterThan(0.8);
    expect(number.y).toBeGreaterThan(0.85);
  }, 150_000);

  it("leaves OCR off unless asked", () => {
    const script = `
      require(${JSON.stringify(join(__dirname, "pdf-text.ts"))})
        .extractPdfText(require("fs").readFileSync(${JSON.stringify(join(__dirname, "__fixtures__/scanned-a101.pdf"))}))
        .then((p) => process.stdout.write(JSON.stringify(p)));
    `;
    const pages = JSON.parse(
      execFileSync(process.execPath, ["-r", "ts-node/register/transpile-only", "-e", script], { cwd: join(__dirname, "../.."), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
    ) as PageText[];
    expect(pages[0].words).toEqual([]);
    expect(pages[0].fromScan).toBeUndefined();
  }, 60_000);
});
