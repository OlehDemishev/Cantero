/**
 * pdf.js in the browser: loading a document, rendering a page crisply at any zoom, and reading the
 * page's vector geometry so takeoff clicks can snap to the drawing's own line ends and corners.
 *
 * Coordinates everywhere here are "page units": the page as displayed (its /Rotate applied),
 * origin top-left, 1 unit = 1/72 inch of paper — pdf.js's viewport at scale 1. Takeoff points on a
 * PDF are stored in these, so a printed scale like 1:100 converts them exactly (see the API's
 * TakeoffsService.calibrateByRatio).
 */
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");
let pdfjs: Promise<PdfJs> | null = null;

function lib(): Promise<PdfJs> {
  pdfjs ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return m;
  });
  return pdfjs;
}

/** The document plus `destroy`, which frees its worker-side memory (it lives on pdf.js's loading
 * task, not the document). */
export async function loadPdf(data: Blob | ArrayBuffer): Promise<{ doc: PDFDocumentProxy; destroy: () => Promise<void> }> {
  const { getDocument } = await lib();
  const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
  const task = getDocument({ data: bytes });
  return { doc: await task.promise, destroy: () => task.destroy() };
}

/**
 * Draws `page` into `canvas` so that 1 page unit = `scale` CSS pixels, at the screen's real pixel
 * density — vector drawings stay sharp at any zoom because every zoom re-renders from the PDF.
 * Returns a cancel function; call it before starting another render into the same canvas.
 */
export function renderPage(page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number): { done: Promise<void>; cancel: () => void } {
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 3);
  const viewport = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
  const task = page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport });
  return {
    done: task.promise.catch((err: unknown) => {
      if ((err as { name?: string })?.name !== "RenderingCancelledException") throw err;
    }),
    cancel: () => task.cancel(),
  };
}

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** pdf.js path encoding (DrawOPS): opcode, then that op's coordinates. */
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

/**
 * Every line end and corner the page draws, in page units — what a takeoff click snaps to. Reads
 * the page's operator list, following the transform stack (save/restore, cm, form XObjects) so
 * geometry inside nested blocks lands in the right place. Curves contribute their end points, not
 * their control points. Text and images contribute nothing.
 */
export async function pageVertices(page: PDFPageProxy): Promise<Float64Array> {
  const { OPS } = await lib();
  const viewport = page.getViewport({ scale: 1 });
  // PDF user space → displayed page units (flips y, applies /Rotate).
  const base = viewport.transform as Matrix;
  const ops = await page.getOperatorList();
  const out: number[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];

  const push = (x: number, y: number) => {
    const m = multiply(base, ctm);
    out.push(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
  };

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiply(ctm, args as Matrix);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const matrix = args[0] as Matrix | null;
      if (matrix) ctm = multiply(ctm, matrix);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.constructPath) {
      const data = (args[1] as unknown[] | undefined)?.[0];
      if (!(data instanceof Float32Array)) continue;
      for (let k = 0; k < data.length; ) {
        switch (data[k++]) {
          case DRAW.moveTo:
          case DRAW.lineTo:
            push(data[k++], data[k++]);
            break;
          case DRAW.curveTo:
            k += 4;
            push(data[k++], data[k++]);
            break;
          case DRAW.quadraticCurveTo:
            k += 2;
            push(data[k++], data[k++]);
            break;
          case DRAW.closePath:
            break;
          default:
            k = data.length; // unknown encoding: stop rather than misread
        }
      }
    }
  }
  return Float64Array.from(out);
}

/** Nearest-vertex lookup over a uniform grid, fast enough to run on every mouse move. */
export class VertexIndex {
  private readonly cells = new Map<string, number[]>();

  constructor(
    private readonly vertices: Float64Array,
    private readonly cellSize = 8,
  ) {
    for (let i = 0; i < vertices.length; i += 2) {
      const key = this.key(vertices[i], vertices[i + 1]);
      const cell = this.cells.get(key);
      if (cell) cell.push(i);
      else this.cells.set(key, [i]);
    }
  }

  get size(): number {
    return this.vertices.length / 2;
  }

  /** The closest vertex within `radius` page units of (x, y), or null. */
  nearest(x: number, y: number, radius: number): { x: number; y: number } | null {
    const reach = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    let best: { x: number; y: number } | null = null;
    let bestDist = radius * radius;
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      for (let gy = cy - reach; gy <= cy + reach; gy++) {
        for (const i of this.cells.get(`${gx},${gy}`) ?? []) {
          const dx = this.vertices[i] - x;
          const dy = this.vertices[i + 1] - y;
          const d = dx * dx + dy * dy;
          if (d <= bestDist) {
            bestDist = d;
            best = { x: this.vertices[i], y: this.vertices[i + 1] };
          }
        }
      }
    }
    return best;
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }
}
