import { PdfService, type PdfDocumentSpec, type PdfTextDocumentSpec } from "./pdf.service";

describe("PdfService", () => {
  let service: PdfService;

  beforeEach(() => {
    service = new PdfService();
  });

  const baseTableSpec: PdfDocumentSpec = {
    title: "Invoice #1042",
    subtitle: "Acme Construction",
    meta: [{ label: "Date", value: "2026-01-05" }],
    tableHeader: ["Item", "Qty", "Amount"],
    tableRows: [{ cells: ["Concrete", "10", "$500.00"] }, { cells: ["Labor", "20", "$1,200.00"] }],
    totals: [
      { label: "Subtotal", value: "$1,700.00" },
      { label: "Total", value: "$1,700.00", emphasize: true },
    ],
  };

  const baseTextSpec: PdfTextDocumentSpec = {
    title: "Subcontractor Agreement",
    subtitle: "Acme Construction",
    meta: [{ label: "Date", value: "2026-01-05" }],
    body: "This agreement is entered into...\n\nBy signing below, both parties agree to the terms.",
  };

  describe("render()", () => {
    it("produces a well-formed PDF buffer", async () => {
      const buffer = await service.render(baseTableSpec);
      expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(buffer.subarray(-6).toString("ascii").trim()).toBe("%%EOF");
      expect(buffer.length).toBeGreaterThan(500);
    });

    it("renders a cover page first when coverLetter is given, adding a second page", async () => {
      const withCover = await service.render({ ...baseTableSpec, coverLetter: "Dear client, please find your invoice attached." });
      const withoutCover = await service.render(baseTableSpec);
      expect(withCover.length).toBeGreaterThan(withoutCover.length);
    });

    it("does not reject when the branding logo is corrupt image data", async () => {
      const buffer = await service.render({
        ...baseTableSpec,
        branding: { logoBuffer: Buffer.from("not a real image"), accentColor: "#465fff" },
      });
      expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });

    it("does not reject when the signature image is corrupt, but still renders the signer line", async () => {
      const buffer = await service.render({
        ...baseTableSpec,
        signature: { signerName: "Jane Doe", signedAt: new Date("2026-01-06"), imageBuffer: Buffer.from("garbage") },
      });
      expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });

    it("renders successfully with an empty table and no totals", async () => {
      const buffer = await service.render({ ...baseTableSpec, tableRows: [], totals: [] });
      expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });
  });

  describe("renderTextDocument()", () => {
    it("produces a well-formed PDF buffer", async () => {
      const buffer = await service.renderTextDocument(baseTextSpec);
      expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(buffer.subarray(-6).toString("ascii").trim()).toBe("%%EOF");
    });

    it("does not reject when the branding logo or signature image is corrupt", async () => {
      const buffer = await service.renderTextDocument({
        ...baseTextSpec,
        branding: { logoBuffer: Buffer.from("nope") },
        signature: { signerName: "Jane Doe", signedAt: new Date("2026-01-06"), imageBuffer: Buffer.from("nope") },
      });
      expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });

    it("renders longer output for longer body text", async () => {
      const short = await service.renderTextDocument(baseTextSpec);
      const long = await service.renderTextDocument({ ...baseTextSpec, body: baseTextSpec.body.repeat(50) });
      expect(long.length).toBeGreaterThan(short.length);
    });
  });
});
