import { inflateSync } from "zlib";
import { PdfService, type PdfDocumentSpec } from "./pdf.service";

function baseSpec(overrides: Partial<PdfDocumentSpec> = {}): PdfDocumentSpec {
  return {
    title: "Invoice INV-2026-042",
    subtitle: "Bauherr Schmidt",
    meta: [{ label: "Status", value: "sent" }],
    tableHeader: ["Description", "Qty", "Unit Price", "Total"],
    tableRows: [{ cells: ["Concrete slab", "100", "45.5", "4550"] }],
    totals: [{ label: "Total Due", value: "5414.5 EUR", emphasize: true }],
    ...overrides,
  };
}

/** pdfkit compresses page/metadata streams by default — a literal-text search on the raw PDF
 * bytes won't find content inside them. Inflate every `stream...endstream` block found (silently
 * skipping ones that aren't actually Flate-compressed) and search the combined text instead. */
function decompressedText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  let combined = raw;
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw))) {
    try {
      combined += "\n" + inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      // Not Flate-compressed (or not a real stream boundary) — nothing to add for this match.
    }
  }
  return combined;
}

describe("PdfService.renderZugferdInvoice", () => {
  it("produces a PDF/A-3b document with the embedded XML attached as factur-x.xml", async () => {
    const service = new PdfService();
    const xml = "<rsm:CrossIndustryInvoice>fixture</rsm:CrossIndustryInvoice>";

    const buf = await service.renderZugferdInvoice(baseSpec(), Buffer.from(xml, "utf-8"));

    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 8).toString("ascii")).toBe("%PDF-1.7");

    const text = decompressedText(buf);
    // The attachment mechanism: name, MIME type, and AFRelationship land in the (uncompressed)
    // object dictionaries, while the file's own bytes are compressed like any other stream.
    expect(text).toContain("factur-x.xml");
    expect(text).toContain("AFRelationship");
    expect(text).toContain("CrossIndustryInvoice");
    // The PDF/A conformance marker (part 3, level B) is XMP metadata, only written because
    // pdfVersion is forced to 1.7 — pdfkit silently skips the whole Metadata stream on PDF 1.3.
    expect(text).toContain("<pdfaid:part>3</pdfaid:part>");
    expect(text).toContain("<pdfaid:conformance>B</pdfaid:conformance>");
    // The sRGB output intent pdfkit bundles for PDF/A color-profile compliance.
    expect(text).toContain("OutputIntent");
  });

  it("embeds the Roboto font instead of falling back to a non-embedded standard font", async () => {
    // Page content streams encode drawn text as CID/glyph-index codes for an embedded subset font
    // (readable only via its ToUnicode CMap), not literal ASCII — so this checks the font
    // resources instead of searching for "Concrete slab" as a literal substring.
    const service = new PdfService();
    const buf = await service.renderZugferdInvoice(baseSpec(), Buffer.from("<x/>", "utf-8"));
    const text = decompressedText(buf);
    expect(text).toMatch(/\/BaseFont\s*\/\S*\+?Roboto/);
    expect(text).toMatch(/FontFile2|FontFile3/);
    expect(text).not.toContain("/BaseFont /Helvetica");
  });
});
