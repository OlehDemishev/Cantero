import { GobdService } from "./gobd.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { GobdAnchorService } from "../common/gobd/gobd-anchor.service";

const COMPANY_A = "company-a";

describe("GobdService", () => {
  let service: GobdService;
  let prisma: { company: { findUniqueOrThrow: jest.Mock } };
  let pdfService: { renderTextDocument: jest.Mock };
  let storage: { read: jest.Mock };
  let anchors: { tsaUrl: string | undefined; list: jest.Mock };

  beforeEach(() => {
    prisma = { company: { findUniqueOrThrow: jest.fn() } };
    pdfService = { renderTextDocument: jest.fn().mockResolvedValue(Buffer.from("pdf-bytes")) };
    storage = { read: jest.fn() };
    anchors = { tsaUrl: undefined, list: jest.fn().mockResolvedValue([]) };
    service = new GobdService(
      prisma as unknown as PrismaService,
      pdfService as unknown as PdfService,
      storage as unknown as StorageService,
      anchors as unknown as GobdAnchorService,
    );
  });

  it("generates the Verfahrensdokumentation with the company's own name and branding", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Cantero Demo GmbH", logoStorageKey: null, brandColor: "#123456" });

    const pdf = await service.generateVerfahrensdokumentation(COMPANY_A);

    expect(pdf.toString()).toBe("pdf-bytes");
    const spec = pdfService.renderTextDocument.mock.calls[0][0];
    expect(spec.title).toBe("Verfahrensdokumentation GoBD");
    expect(spec.subtitle).toBe("Cantero Demo GmbH");
    expect(spec.branding).toEqual({ logoBuffer: undefined, accentColor: "#123456" });
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("mentions Festschreibung, the correction procedure, and the ledger's hash chain, with an honest disclaimer of what it doesn't cover", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Acme", logoStorageKey: null, brandColor: null });

    await service.generateVerfahrensdokumentation(COMPANY_A);

    const body = pdfService.renderTextDocument.mock.calls[0][0].body as string;
    expect(body).toContain("FESTSCHREIBUNG");
    expect(body).toContain("Stornorechnung");
    expect(body).toContain("Hash-Wert des");
    expect(body).toMatch(/Backup|Aufbewahrungsfrist/);
  });

  it("states whether the ledger is timestamped outside the app, and when it last was", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Acme", logoStorageKey: null, brandColor: null });
    const meta = async () => {
      await service.generateVerfahrensdokumentation(COMPANY_A);
      return pdfService.renderTextDocument.mock.calls.at(-1)[0].meta.find((m: { label: string }) => m.label === "Externe Zeitstempel").value;
    };

    expect(await meta()).toBe("nicht eingerichtet");
    anchors.tsaUrl = "http://timestamp.digicert.com";
    anchors.list.mockResolvedValue([{ sequence: 42, timestampedAt: new Date("2026-09-30T03:00:00Z") }]);
    expect(await meta()).toBe("aktiv (timestamp.digicert.com), zuletzt 2026-09-30 (Eintrag #42)");
    expect(pdfService.renderTextDocument.mock.calls.at(-1)[0].body).toContain("RFC 3161");
  });

  it("reads the company logo from storage when one is set", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Acme", logoStorageKey: "company-a/logo.png", brandColor: null });
    storage.read.mockResolvedValue(Buffer.from("logo-bytes"));

    await service.generateVerfahrensdokumentation(COMPANY_A);

    expect(storage.read).toHaveBeenCalledWith("company-a/logo.png");
    expect(pdfService.renderTextDocument.mock.calls[0][0].branding.logoBuffer.toString()).toBe("logo-bytes");
  });
});
