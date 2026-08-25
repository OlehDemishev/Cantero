import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";

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
}
