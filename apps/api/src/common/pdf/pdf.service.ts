import { readFileSync } from "fs";
import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";

// Loaded once at module scope, not per render — these two files are the only ones ZUGFeRD PDFs
// need. PDF/A mandates every rendered font be embedded (pdfkit's built-in "Helvetica"/
// "Helvetica-Bold" used by render() below are NOT embedded, so they can't be reused here).
// @fontsource/roboto is OFL-1.1 licensed and ships actual font files meant for exactly this kind
// of redistribution/embedding. Deliberately the plain ".woff" (not ".woff2") build: pdfkit embeds
// fonts by calling fontkit's font.createSubset(), and with this pdfkit/fontkit version pair,
// subsetting a WOFF2-sourced font throws ("Attempt to access memory outside buffer bounds" in
// fontkit's TTFSubset encoder — a real, reproducible crash, not a hypothetical) while the
// classic-WOFF-sourced font subsets cleanly. Confirmed by hand: generate a PDF and grep its
// decompressed streams for "pdfaid:part"/"factur-x.xml" before changing this.
const ROBOTO_REGULAR = readFileSync(require.resolve("@fontsource/roboto/files/roboto-latin-400-normal.woff"));
const ROBOTO_BOLD = readFileSync(require.resolve("@fontsource/roboto/files/roboto-latin-700-normal.woff"));

export interface PdfTableRow {
  cells: string[];
}

export interface PdfBranding {
  /** Raw PNG/JPEG bytes — pdfkit can't rasterize SVG, so the caller must already have a raster logo. */
  logoBuffer?: Buffer;
  /** Hex color (e.g. "#465fff") for the title, dividers, and the emphasized total. Falls back to black/gray when unset. */
  accentColor?: string;
}

export interface PdfSignature {
  /** Raw PNG bytes of the drawn signature — absent if storage lookup failed, in which case only the text line renders. */
  imageBuffer?: Buffer;
  signerName: string;
  signedAt: Date;
}

export interface PdfDocumentSpec {
  title: string;
  subtitle?: string;
  /** Client-facing intro text rendered as its own page ahead of everything else — absent means no cover page. */
  coverLetter?: string;
  meta: { label: string; value: string }[];
  tableHeader: string[];
  tableRows: PdfTableRow[];
  totals: { label: string; value: string; emphasize?: boolean }[];
  branding?: PdfBranding;
  signature?: PdfSignature;
}

export interface PdfTextDocumentSpec {
  title: string;
  subtitle?: string;
  meta: { label: string; value: string }[];
  /** Free-form prose — a contract body, not a priced line-item table. Rendered as flowing text
   * with blank lines preserved as paragraph breaks. */
  body: string;
  branding?: PdfBranding;
  signature?: PdfSignature;
}

const DEFAULT_DIVIDER_COLOR = "#ccc";
const DEFAULT_TEXT_COLOR = "#000";
const LOGO_MAX_WIDTH = 90;
const LOGO_MAX_HEIGHT = 50;
const SIGNATURE_MAX_WIDTH = 160;
const SIGNATURE_MAX_HEIGHT = 60;

@Injectable()
export class PdfService {
  render(spec: PdfDocumentSpec): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const accentColor = spec.branding?.accentColor ?? DEFAULT_TEXT_COLOR;
      const dividerColor = spec.branding?.accentColor ?? DEFAULT_DIVIDER_COLOR;

      if (spec.coverLetter) {
        if (spec.branding?.logoBuffer) {
          try {
            doc.image(spec.branding.logoBuffer, doc.page.width - 50 - LOGO_MAX_WIDTH, 50, {
              fit: [LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT],
            });
          } catch {
            // A corrupt/unsupported image shouldn't block the rest of the document from rendering.
          }
        }
        doc.fillColor(accentColor).fontSize(22).text(spec.title, 50, 140);
        doc.fillColor(DEFAULT_TEXT_COLOR).fontSize(12).moveDown(2).text(spec.coverLetter, { width: doc.page.width - 100 });
        doc.addPage();
      }

      if (spec.branding?.logoBuffer) {
        try {
          doc.image(spec.branding.logoBuffer, doc.page.width - 50 - LOGO_MAX_WIDTH, 50, {
            fit: [LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT],
          });
        } catch {
          // A corrupt/unsupported image shouldn't block the rest of the document from rendering.
        }
      }

      doc.fillColor(accentColor).fontSize(20).text(spec.title, { align: "left" });
      doc.fillColor(DEFAULT_TEXT_COLOR);
      if (spec.subtitle) {
        doc.moveDown(0.2).fontSize(11).fillColor("#555").text(spec.subtitle);
        doc.fillColor(DEFAULT_TEXT_COLOR);
      }
      doc.moveDown(1);

      for (const item of spec.meta) {
        doc.fontSize(10).text(`${item.label}: ${item.value}`);
      }
      doc.moveDown(1);

      const colWidth = (doc.page.width - 100) / spec.tableHeader.length;
      const startX = doc.x;
      let y = doc.y;

      doc.fontSize(10).font("Helvetica-Bold");
      spec.tableHeader.forEach((header, i) => {
        doc.text(header, startX + i * colWidth, y, { width: colWidth });
      });
      y += 18;
      doc.moveTo(startX, y).lineTo(doc.page.width - 50, y).strokeColor(dividerColor).stroke();
      y += 6;

      doc.font("Helvetica");
      for (const row of spec.tableRows) {
        row.cells.forEach((cell, i) => {
          doc.text(cell, startX + i * colWidth, y, { width: colWidth });
        });
        y += 18;
      }

      y += 10;
      doc.moveTo(startX, y).lineTo(doc.page.width - 50, y).strokeColor(dividerColor).stroke();
      y += 10;

      for (const total of spec.totals) {
        doc.font(total.emphasize ? "Helvetica-Bold" : "Helvetica").fontSize(total.emphasize ? 13 : 10);
        doc.fillColor(total.emphasize ? accentColor : DEFAULT_TEXT_COLOR);
        doc.text(`${total.label}: ${total.value}`, startX, y, { align: "right" });
        y += total.emphasize ? 20 : 16;
      }
      doc.fillColor(DEFAULT_TEXT_COLOR);

      if (spec.signature) {
        y += 20;
        doc.fontSize(9).fillColor("#555");
        doc.text(
          `Signed by ${spec.signature.signerName} on ${spec.signature.signedAt.toISOString().slice(0, 10)}`,
          startX,
          y,
        );
        y += 16;
        if (spec.signature.imageBuffer) {
          try {
            doc.image(spec.signature.imageBuffer, startX, y, { fit: [SIGNATURE_MAX_WIDTH, SIGNATURE_MAX_HEIGHT] });
          } catch {
            // A corrupt/unsupported signature image shouldn't block the rest of the document.
          }
        }
        doc.fillColor(DEFAULT_TEXT_COLOR);
      }

      doc.end();
    });
  }

  /**
   * A ZUGFeRD/Factur-X hybrid invoice: the same visual layout as render(), but as a standalone
   * PDF/A-3b document (pdfkit's `subset` option — embeds the required XMP conformance metadata and
   * an sRGB ICC output intent automatically on doc.end()) with `embeddedXml` attached as
   * "factur-x.xml" (the exact name/relationship the spec mandates — see ZugferdService/
   * InvoicesService.generateZugferdPdf). This duplicates render()'s drawing logic rather than
   * extending it, because `subset` and embedded fonts are constructor-time PDFDocument options
   * that can't be layered onto an already-built document — keeping it a separate method means
   * every other document type (contracts, schedule-of-values, the plain invoice PDF) is completely
   * unaffected by this format's stricter requirements.
   */
  renderZugferdInvoice(spec: PdfDocumentSpec, embeddedXml: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // pdfVersion must be explicit: pdfkit defaults to PDF 1.3, and its own endMetadata() silently
      // skips writing the XMP metadata stream entirely on 1.3 (metadata didn't exist before 1.4) —
      // which would silently drop the PDF/A conformance markers `subset` is supposed to add. PDF/A-3
      // itself is built on PDF 1.7, so this also isn't just "pick something newer than 1.3".
      const doc = new PDFDocument({ margin: 50, size: "A4", subset: "PDF/A-3b", pdfVersion: "1.7" });
      doc.registerFont("Roboto", ROBOTO_REGULAR);
      doc.registerFont("Roboto-Bold", ROBOTO_BOLD);
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const accentColor = spec.branding?.accentColor ?? DEFAULT_TEXT_COLOR;
      const dividerColor = spec.branding?.accentColor ?? DEFAULT_DIVIDER_COLOR;

      if (spec.branding?.logoBuffer) {
        try {
          doc.image(spec.branding.logoBuffer, doc.page.width - 50 - LOGO_MAX_WIDTH, 50, {
            fit: [LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT],
          });
        } catch {
          // A corrupt/unsupported image shouldn't block the rest of the document from rendering.
        }
      }

      doc.font("Roboto-Bold").fillColor(accentColor).fontSize(20).text(spec.title, { align: "left" });
      doc.fillColor(DEFAULT_TEXT_COLOR);
      if (spec.subtitle) {
        doc.font("Roboto").moveDown(0.2).fontSize(11).fillColor("#555").text(spec.subtitle);
        doc.fillColor(DEFAULT_TEXT_COLOR);
      }
      doc.moveDown(1);

      doc.font("Roboto");
      for (const item of spec.meta) {
        doc.fontSize(10).text(`${item.label}: ${item.value}`);
      }
      doc.moveDown(1);

      const colWidth = (doc.page.width - 100) / spec.tableHeader.length;
      const startX = doc.x;
      let y = doc.y;

      doc.fontSize(10).font("Roboto-Bold");
      spec.tableHeader.forEach((header, i) => {
        doc.text(header, startX + i * colWidth, y, { width: colWidth });
      });
      y += 18;
      doc.moveTo(startX, y).lineTo(doc.page.width - 50, y).strokeColor(dividerColor).stroke();
      y += 6;

      doc.font("Roboto");
      for (const row of spec.tableRows) {
        row.cells.forEach((cell, i) => {
          doc.text(cell, startX + i * colWidth, y, { width: colWidth });
        });
        y += 18;
      }

      y += 10;
      doc.moveTo(startX, y).lineTo(doc.page.width - 50, y).strokeColor(dividerColor).stroke();
      y += 10;

      for (const total of spec.totals) {
        doc.font(total.emphasize ? "Roboto-Bold" : "Roboto").fontSize(total.emphasize ? 13 : 10);
        doc.fillColor(total.emphasize ? accentColor : DEFAULT_TEXT_COLOR);
        doc.text(`${total.label}: ${total.value}`, startX, y, { align: "right" });
        y += total.emphasize ? 20 : 16;
      }
      doc.fillColor(DEFAULT_TEXT_COLOR);

      // @types/pdfkit@0.13.9 hasn't caught up with pdfkit 0.15's `relationship` attachment option
      // (confirmed present and functional in pdfkit's own source — AttachmentsMixin.file) — the
      // cast below is scoped to just this one call, not a blanket `any`.
      doc.file(embeddedXml, {
        name: "factur-x.xml",
        type: "text/xml",
        description: "Factur-X/ZUGFeRD structured invoice data (EN16931 Comfort, CII syntax)",
        relationship: "Data",
      } as PDFKit.Mixins.PDFAttachmentOptions & { relationship: "Data" });

      doc.end();
    });
  }

  /** Same header/branding/signature treatment as render(), but for a free-form prose document
   * (a contract) instead of a priced line-item table. */
  renderTextDocument(spec: PdfTextDocumentSpec): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const accentColor = spec.branding?.accentColor ?? DEFAULT_TEXT_COLOR;

      if (spec.branding?.logoBuffer) {
        try {
          doc.image(spec.branding.logoBuffer, doc.page.width - 50 - LOGO_MAX_WIDTH, 50, {
            fit: [LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT],
          });
        } catch {
          // A corrupt/unsupported image shouldn't block the rest of the document from rendering.
        }
      }

      doc.fillColor(accentColor).fontSize(20).text(spec.title, { align: "left" });
      doc.fillColor(DEFAULT_TEXT_COLOR);
      if (spec.subtitle) {
        doc.moveDown(0.2).fontSize(11).fillColor("#555").text(spec.subtitle);
        doc.fillColor(DEFAULT_TEXT_COLOR);
      }
      doc.moveDown(1);

      for (const item of spec.meta) {
        doc.fontSize(10).text(`${item.label}: ${item.value}`);
      }
      doc.moveDown(1);

      doc.fontSize(11).text(spec.body, { width: doc.page.width - 100, align: "left" });

      if (spec.signature) {
        doc.moveDown(2);
        doc.fontSize(9).fillColor("#555");
        doc.text(`Signed by ${spec.signature.signerName} on ${spec.signature.signedAt.toISOString().slice(0, 10)}`);
        doc.moveDown(0.5);
        if (spec.signature.imageBuffer) {
          try {
            doc.image(spec.signature.imageBuffer, doc.x, doc.y, { fit: [SIGNATURE_MAX_WIDTH, SIGNATURE_MAX_HEIGHT] });
          } catch {
            // A corrupt/unsupported signature image shouldn't block the rest of the document.
          }
        }
        doc.fillColor(DEFAULT_TEXT_COLOR);
      }

      doc.end();
    });
  }
}
