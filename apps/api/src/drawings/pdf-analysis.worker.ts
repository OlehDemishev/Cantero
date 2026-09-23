import { parentPort, workerData } from "node:worker_threads";
import { analyzeInProcess, PdfAnalysisError, type AnalysisRequest } from "./pdf-analysis";

/** Entry point of the worker thread analyzePdf() starts: one analysis, then the thread ends. */
const port = parentPort!;
analyzeInProcess(workerData as AnalysisRequest, (done, total) => port.postMessage({ type: "progress", done, total }))
  .then((result) => port.postMessage({ type: "done", result }))
  .catch((err: unknown) =>
    port.postMessage({
      type: "error",
      code: err instanceof PdfAnalysisError ? err.code : "failed",
      message: err instanceof Error ? err.message : String(err),
    }),
  );
