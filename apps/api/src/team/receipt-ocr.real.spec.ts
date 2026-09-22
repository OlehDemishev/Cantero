import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The real Tesseract with the models shipped in the app, on a German receipt (__fixtures__/
 * receipt-de.png: umlauts, "ß", a Zwischensumme and a MwSt line next to the SUMME). The unit tests
 * mock tesseract.js; this is what proves the local model directory actually loads — a wrong
 * langPath or gzip flag would otherwise pass every mock and silently return an empty extraction,
 * since the service is best-effort by design. Runs in a plain Node process: tesseract.js's
 * worker threads and WebAssembly don't run under Jest's module system.
 */
describe("ReceiptOcrService with the real OCR engine", () => {
  it("reads a German receipt with the bundled models, offline", () => {
    const fixture = join(__dirname, "__fixtures__/receipt-de.png");
    const script = `
      const { ConfigService } = require("@nestjs/config");
      const { ReceiptOcrService } = require(${JSON.stringify(join(__dirname, "receipt-ocr.service.ts"))});
      new ReceiptOcrService(new ConfigService({})).extract(require("fs").readFileSync(${JSON.stringify(fixture)}))
        .then((r) => process.stdout.write(JSON.stringify(r)));
    `;
    const cwd = join(__dirname, "../..");
    const out = execFileSync(process.execPath, ["-r", "ts-node/register/transpile-only", "-e", script], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 120_000,
    });
    const result = JSON.parse(out);

    expect(result.rawText).toContain("Bäckerei Müller GmbH");
    expect(result.rawText).toContain("Hauptstraße");
    expect(result).toMatchObject({ amount: 3.5, incurredAt: new Date(Date.UTC(2026, 7, 27)).toISOString(), vendorGuess: "Bäckerei Müller GmbH" });
    // No model downloaded or cached into the working directory.
    expect(existsSync(join(cwd, "deu.traineddata"))).toBe(false);
  }, 150_000);
});
