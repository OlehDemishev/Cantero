/**
 * Extracts the embedded Factur-X/ZUGFeRD CII XML from a hybrid PDF/A-3 — the reverse of
 * PdfService.renderZugferdInvoice(), which embeds it as `factur-x.xml` via pdfkit's
 * `doc.file(...)`. Uses pdfjs-dist (Mozilla's PDF.js) for the underlying PDF parsing, since none
 * of this project's other PDF dependencies (pdfkit is generation-only) can read an existing PDF's
 * embedded-file structure.
 *
 * pdfjs-dist ships ESM-only (no CommonJS build) as of v6 — this project compiles to CommonJS
 * (see tsconfig.json), so this uses a dynamic `import()` rather than `require()`. Node 22 loads
 * that via its "require(esm)" interop and prints a one-line ExperimentalWarning to stderr the
 * first time; this is expected, harmless, and does not affect behavior — confirmed by generating
 * a real ZUGFeRD PDF with this codebase's own buildZugferdCiiXml()/renderZugferdInvoice() and
 * round-tripping it through this exact function during development.
 */
export async function extractZugferdXmlFromPdf(pdfBuffer: Buffer): Promise<string | null> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // destroy() lives on the loading task, not the resolved PDFDocumentProxy — keep the task
  // reference around so cleanup can still happen after awaiting `.promise`.
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  try {
    const doc = await loadingTask.promise;
    const attachments = await doc.getAttachments();
    if (!attachments) return null;
    for (const [name] of attachments) {
      if (!/\.xml$/i.test(name)) continue;
      const content = await doc.getAttachmentContent(name);
      if (!content) continue;
      return Buffer.from(content).toString("utf-8");
    }
    return null;
  } finally {
    await loadingTask.destroy();
  }
}
