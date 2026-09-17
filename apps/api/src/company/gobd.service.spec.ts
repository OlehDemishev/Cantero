import { GobdService } from "./gobd.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";

const COMPANY_A = "company-a";

describe("GobdService", () => {
  let service: GobdService;
  let prisma: { company: { findUniqueOrThrow: jest.Mock } };
  let pdfService: { renderTextDocument: jest.Mock };
  let storage: { read: jest.Mock };

  beforeEach(() => {
    prisma = { company: { findUniqueOrThrow: jest.fn() } };
    pdfService = { renderTextDocument: jest.fn().mockResolvedValue(Buffer.from("pdf-bytes")) };
    storage = { read: jest.fn() };
    service = new GobdService(prisma as unknown as PrismaService, pdfService as unknown as PdfService, storage as unknown as StorageService);
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

  it("reads the company logo from storage when one is set", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Acme", logoStorageKey: "company-a/logo.png", brandColor: null });
    storage.read.mockResolvedValue(Buffer.from("logo-bytes"));

    await service.generateVerfahrensdokumentation(COMPANY_A);

    expect(storage.read).toHaveBeenCalledWith("company-a/logo.png");
    expect(pdfService.renderTextDocument.mock.calls[0][0].branding.logoBuffer.toString()).toBe("logo-bytes");
  });
});
