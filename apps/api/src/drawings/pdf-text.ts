import { TitleBlockReader } from "./scan-ocr";

/**
 * Reads the words printed on each page of a PDF, with where they sit on the page — the input to
 * sheet-number recognition and cross-sheet link detection. CAD exports (AutoCAD, Revit, Archicad,
 * Allplan…) keep their text as real text, so this needs no OCR; a scanned drawing has no text layer
 * and simply yields no words.
 *
 * Positions are fractions of the page as displayed (0–1, origin top-left, the page's /Rotate
 * applied), so they line up with the viewer however the page is rendered.
 */

export interface PageWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text height relative to the page's longer side — for comparing sizes of words on one page. */
  size: number;
}

export interface PageText {
  pageNumber: number;
  /** The page had no text layer (a scan) and its words were read by OCR from the title-block corner. */
  fromScan?: boolean;
  /** Page size in PDF units (1/72 in) as displayed. */
  width: number;
  height: number;
  words: PageWord[];
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface Viewport {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): number[];
}

/**
 * Every page's words. `maxPages` bounds the work on a huge set. With `ocrScans`, a page with no
 * text layer at all (a scanned drawing) has its title-block corner read by OCR instead — up to
 * `ocrScans.maxPages` of them, since each takes a second or two.
 */
export async function extractPdfText(pdf: Buffer, maxPages = Infinity, options: { ocrScans?: { maxPages: number } } = {}): Promise<PageText[]> {
  // pdfjs-dist is ESM-only; see extract-zugferd-xml-from-pdf.ts for why this is a dynamic import.
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdf) });
  const reader = options.ocrScans ? new TitleBlockReader() : null;
  let scansRead = 0;
  try {
    const doc = await loadingTask.promise;
    const pages: PageText[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 }) as Viewport;
      const content = await page.getTextContent();
      const words = (content.items as PdfTextItem[]).filter((i) => typeof i.str === "string" && i.str.trim()).flatMap((i) => itemWords(i, viewport));
      if (words.length === 0 && reader && scansRead < options.ocrScans!.maxPages) {
        scansRead++;
        const scanned = await reader.read(page as never, doc.canvasFactory as never).catch(() => []);
        pages.push({ pageNumber: n, width: viewport.width, height: viewport.height, words: scanned, fromScan: true });
      } else {
        pages.push({ pageNumber: n, width: viewport.width, height: viewport.height, words });
      }
      page.cleanup();
    }
    return pages;
  } finally {
    await reader?.close();
    await loadingTask.destroy();
  }
}

export async function pdfPageCount(pdf: Buffer): Promise<number> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdf) });
  try {
    return (await loadingTask.promise).numPages;
  } finally {
    await loadingTask.destroy();
  }
}

/** Splits one text run into words, placing each along the run's baseline in proportion to its
 * characters (pdf.js reports a run's box, not per-glyph positions). Handles rotated text. */
export function itemWords(item: PdfTextItem, viewport: Viewport): PageWord[] {
  const [a, b, c, d, e, f] = item.transform;
  const along = Math.hypot(a, b) || 1;
  const up = Math.hypot(c, d) || 1;
  const dir = [a / along, b / along];
  const upDir = [c / up, d / up];
  const height = item.height || up;
  const length = item.str.length;
  if (length === 0 || item.width <= 0) return [];

  const words: PageWord[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(item.str))) {
    const t0 = (m.index / length) * item.width;
    const t1 = ((m.index + m[0].length) / length) * item.width;
    const corners = [
      [e + dir[0] * t0, f + dir[1] * t0],
      [e + dir[0] * t1, f + dir[1] * t1],
      [e + dir[0] * t0 + upDir[0] * height, f + dir[1] * t0 + upDir[1] * height],
      [e + dir[0] * t1 + upDir[0] * height, f + dir[1] * t1 + upDir[1] * height],
    ].map(([x, y]) => viewport.convertToViewportPoint(x, y));
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    words.push({
      text: m[0],
      x: left / viewport.width,
      y: top / viewport.height,
      width: (Math.max(...xs) - left) / viewport.width,
      height: (Math.max(...ys) - top) / viewport.height,
      size: height / Math.max(viewport.width, viewport.height),
    });
  }
  return words;
}
