import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";

export interface PdfTableRow {
  cells: string[];
}

export interface PdfDocumentSpec {
  title: string;
  subtitle?: string;
  meta: { label: string; value: string }[];
  tableHeader: string[];
  tableRows: PdfTableRow[];
  totals: { label: string; value: string; emphasize?: boolean }[];
}

@Injectable()
export class PdfService {
  render(spec: PdfDocumentSpec): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(20).text(spec.title, { align: "left" });
      if (spec.subtitle) {
        doc.moveDown(0.2).fontSize(11).fillColor("#555").text(spec.subtitle);
        doc.fillColor("#000");
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
      doc.moveTo(startX, y).lineTo(doc.page.width - 50, y).strokeColor("#ccc").stroke();
      y += 6;

      doc.font("Helvetica");
      for (const row of spec.tableRows) {
        row.cells.forEach((cell, i) => {
          doc.text(cell, startX + i * colWidth, y, { width: colWidth });
        });
        y += 18;
      }

      y += 10;
      doc.moveTo(startX, y).lineTo(doc.page.width - 50, y).strokeColor("#ccc").stroke();
      y += 10;

      for (const total of spec.totals) {
        doc.font(total.emphasize ? "Helvetica-Bold" : "Helvetica").fontSize(total.emphasize ? 13 : 10);
        doc.text(`${total.label}: ${total.value}`, startX, y, { align: "right" });
        y += total.emphasize ? 20 : 16;
      }

      doc.end();
    });
  }
}
