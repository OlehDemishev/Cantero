import { createWorker, type Worker } from "tesseract.js";
import { localWorkerOptions } from "../common/ocr/ocr-languages";
import type { PageWord } from "./pdf-text";

/**
 * Sheet numbers on scanned drawings — pages with no text layer, which pdf-text.ts reads as empty.
 * Only the title-block corner is rendered and OCR'd: a sheet number lives there, and reading a
 * whole A1 scan would take tens of seconds per page. References to other sheets on a scan are not
 * read (too slow, and callout text on a scan is too noisy to link reliably).
 *
 * Runs Tesseract with the models shipped in the app (common/ocr), German + English — sheet numbers
 * and title-block labels are Latin script.
 */

/** The corner searched, as fractions of the page: title blocks sit bottom right (or down the right edge). */
const REGION = { x: 0.5, y: 0.45, width: 0.5, height: 0.55 };
/** Region long edge in pixels — about 300 dpi for an A3 title block, enough for small print. */
const REGION_LONG_EDGE = 3000;

interface RenderablePage {
  getViewport(options: { scale: number; offsetX?: number; offsetY?: number }): { width: number; height: number };
  render(options: { canvas: unknown; canvasContext: unknown; viewport: unknown }): { promise: Promise<void> };
}
interface CanvasFactory {
  create(width: number, height: number): { canvas: { toBuffer(mime: "image/png"): Buffer }; context: unknown };
}

interface TesseractWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

/** One OCR engine for all the scanned pages of an upload; call close() when done. */
export class TitleBlockReader {
  private worker: Promise<Worker> | null = null;

  /** Words in the page's title-block corner, positioned as fractions of the whole page (like pdf-text.ts). */
  async read(page: RenderablePage, canvasFactory: CanvasFactory): Promise<PageWord[]> {
    const base = page.getViewport({ scale: 1 });
    const scale = REGION_LONG_EDGE / Math.max(base.width * REGION.width, base.height * REGION.height);
    const full = page.getViewport({ scale });
    const x0 = full.width * REGION.x;
    const y0 = full.height * REGION.y;
    const w = Math.ceil(full.width * REGION.width);
    const h = Math.ceil(full.height * REGION.height);
    // Shifting the viewport renders only the corner into a corner-sized canvas.
    const viewport = page.getViewport({ scale, offsetX: -x0, offsetY: -y0 });
    const { canvas, context } = canvasFactory.create(w, h);
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const worker = await this.engine();
    const { data } = await worker.recognize(canvas.toBuffer("image/png"), {}, { blocks: true });
    const words: TesseractWord[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
    const longSide = Math.max(full.width, full.height);
    return words
      .filter((word) => word.text.trim() && word.confidence >= 40)
      .map((word) => ({
        text: word.text.trim(),
        x: (x0 + word.bbox.x0) / full.width,
        y: (y0 + word.bbox.y0) / full.height,
        width: (word.bbox.x1 - word.bbox.x0) / full.width,
        height: (word.bbox.y1 - word.bbox.y0) / full.height,
        size: (word.bbox.y1 - word.bbox.y0) / longSide,
      }));
  }

  async close(): Promise<void> {
    if (!this.worker) return;
    const worker = await this.worker.catch(() => null);
    this.worker = null;
    await worker?.terminate();
  }

  private engine(): Promise<Worker> {
    this.worker ??= createWorker("deu+eng", undefined, localWorkerOptions());
    return this.worker;
  }
}
