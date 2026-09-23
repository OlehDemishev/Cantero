import { existsSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { extractPdfText, pdfPageCount } from "./pdf-text";
import { findSheetReferences, recognizeSheet, type Confidence, type SheetReference } from "./sheet-recognition";

/**
 * Reading a drawing set's pages — pdf.js parsing and rendering, Tesseract on scans — takes seconds
 * to minutes and pdf.js does it on the thread it's called from. It runs here, on a worker thread of
 * its own, so the API keeps answering everyone else meanwhile; the drawing-sets queue calls it and
 * keeps the database side (DrawingSetsService.runAnalysis).
 */

/** A set this long is refused outright — split it and upload the parts. */
export const MAX_SET_PAGES = 600;
/** Scanned pages (no text layer) whose title block is OCR'd per set — a second or two each. */
export const MAX_SET_SCANNED_PAGES_OCR = 300;

export interface SetPageAnalysis {
  page: number;
  sheetNumber: string | null;
  title: string | null;
  discipline: string | null;
  confidence: Confidence | null;
  /** Read by OCR from a scanned page's title block, not from a text layer — worth a closer look. */
  fromScan?: boolean;
  /** Every sheet reference printed on the page; the page's own number is dropped at import, once
   * the person has confirmed what that number is. */
  references: SheetReference[];
}

/** Why a PDF couldn't be analyzed — stored on the set as a code the apps put into words. */
export type AnalysisErrorCode = "unreadable" | "empty" | "too-large" | "failed";

export class PdfAnalysisError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type AnalysisRequest =
  /** Every page of a set: number, title and discipline from the title block, plus references. */
  | { kind: "set"; pdf: Uint8Array }
  /** A single sheet's references to other sheets, for sheets uploaded before links were read. */
  | { kind: "links"; pdf: Uint8Array; ownSheetNumber: string };

export type AnalysisResult = { kind: "set"; pages: SetPageAnalysis[] } | { kind: "links"; references: SheetReference[] };

export type ProgressListener = (done: number, total: number) => void;

/** The analysis itself, on whatever thread calls it — the worker thread in production, Jest's own
 * in tests. */
export async function analyzeInProcess(request: AnalysisRequest, onProgress: ProgressListener = () => {}): Promise<AnalysisResult> {
  if (request.kind === "links") {
    const [page] = await extractPdfText(request.pdf, 1);
    return { kind: "links", references: page ? findSheetReferences(page.words, request.ownSheetNumber) : [] };
  }

  const total = await pdfPageCount(request.pdf).catch(() => {
    throw new PdfAnalysisError("unreadable", "This PDF couldn't be read — it may be damaged or password-protected");
  });
  if (total === 0) throw new PdfAnalysisError("empty", "This PDF has no pages");
  if (total > MAX_SET_PAGES) throw new PdfAnalysisError("too-large", `A drawing set can have at most ${MAX_SET_PAGES} pages`);
  onProgress(0, total);

  const pages = await extractPdfText(request.pdf, MAX_SET_PAGES, { ocrScans: { maxPages: MAX_SET_SCANNED_PAGES_OCR }, onPage: onProgress }).catch(() => {
    throw new PdfAnalysisError("unreadable", "This PDF couldn't be read — it may be damaged or password-protected");
  });
  return {
    kind: "set",
    pages: pages.map((p) => ({
      page: p.pageNumber,
      ...recognizeSheet(p.words),
      ...(p.fromScan ? { fromScan: true } : {}),
      // Only the title block of a scan is read, so it has no references worth linking.
      references: p.fromScan ? [] : findSheetReferences(p.words, null),
    })),
  };
}

/** The compiled worker next to this file. Absent under Jest, which runs the TypeScript sources —
 * there the same analysis runs in-process instead. */
const WORKER_FILE = join(__dirname, "pdf-analysis.worker.js");

type WorkerMessage =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; result: AnalysisResult }
  | { type: "error"; code: AnalysisErrorCode; message: string };

/** Runs the analysis on a worker thread of its own, reporting progress as pages are read. */
export function analyzePdf(request: AnalysisRequest, onProgress: ProgressListener = () => {}): Promise<AnalysisResult> {
  if (!existsSync(WORKER_FILE)) return analyzeInProcess(request, onProgress);
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      void worker.terminate();
    };
    // A 100 MB set with pdf.js page objects and a 3000 px render stays well under this.
    const worker = new Worker(WORKER_FILE, { workerData: request, resourceLimits: { maxOldGenerationSizeMb: 1536 } });
    worker.on("message", (message: WorkerMessage) => {
      if (message.type === "progress") onProgress(message.done, message.total);
      else if (message.type === "done") settle(() => resolve(message.result));
      else settle(() => reject(new PdfAnalysisError(message.code, message.message)));
    });
    worker.on("error", (err) => settle(() => reject(err)));
    worker.on("exit", (code) => settle(() => reject(new PdfAnalysisError("failed", `The PDF reader stopped unexpectedly (exit code ${code})`))));
  });
}
