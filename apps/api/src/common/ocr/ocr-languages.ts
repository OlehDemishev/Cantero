import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Tesseract language models shipped with the app (@tesseract.js-data/* packages), so OCR runs
 * fully locally: tesseract.js otherwise downloads each model from a CDN the first time a language
 * is used. The four languages cover the markets and crews this app serves — German, English,
 * Polish, Ukrainian — and the model is the "best_int" variant tesseract.js uses by default.
 */
export const OCR_LANGUAGES = ["deu", "eng", "pol", "ukr"] as const;
export type OcrLanguage = (typeof OCR_LANGUAGES)[number];

const MODEL_VARIANT = "4.0.0_best_int";
let prepared: string | null = null;

/**
 * Tesseract reads every language from one directory, but each package installs its own. Gathers
 * the four gzipped models into one folder once per process (a copy, ~15 MB, so it survives pnpm's
 * symlinked layout and read-only images alike) and returns it for createWorker's `langPath`.
 */
export function ocrLanguageDir(): string {
  if (prepared) return prepared;
  const dir = join(tmpdir(), `cantero-ocr-${MODEL_VARIANT}`);
  mkdirSync(dir, { recursive: true });
  for (const lang of OCR_LANGUAGES) {
    const target = join(dir, `${lang}.traineddata.gz`);
    if (existsSync(target)) continue;
    const pkg = dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
    // Copy then rename: another process starting at the same moment never reads a half-written model.
    const partial = `${target}.${process.pid}.part`;
    copyFileSync(join(pkg, MODEL_VARIANT, `${lang}.traineddata.gz`), partial);
    renameSync(partial, target);
  }
  prepared = dir;
  return dir;
}

/** Options for tesseract.js createWorker: local models only, and no cache files written into the
 * process's working directory (tesseract.js's Node default). */
export function localWorkerOptions() {
  return { langPath: ocrLanguageDir(), gzip: true, cacheMethod: "none" as const };
}

/** "deu+eng+pol+ukr", or the subset OCR_LANGUAGES env names (fewer languages read faster). */
export function ocrLanguageString(configured?: string): string {
  const wanted = (configured ?? "")
    .split(/[+,\s]+/)
    .filter((l): l is OcrLanguage => (OCR_LANGUAGES as readonly string[]).includes(l));
  return (wanted.length > 0 ? wanted : [...OCR_LANGUAGES]).join("+");
}
