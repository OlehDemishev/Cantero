import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { PDFDocument } from "pdf-lib";
import type { AuthUser } from "@cantero/shared";
import { DrawingSetsService, type SetPageAnalysis } from "./drawing-sets.service";
import type { PageWord } from "./pdf-text";

// pdf.js can't load under Jest; sheet-recognition.spec.ts runs the real extraction in Node.
const mockExtract = jest.fn();
jest.mock("./pdf-text", () => ({ extractPdfText: (...args: unknown[]) => mockExtract(...args) }));

const user: AuthUser = { userId: "u1", companyId: "co", role: "admin", email: "a@b.c", name: "Anke" } as AuthUser;
const word = (text: string, x: number, y: number, size = 0.01): PageWord => ({ text, x, y, width: text.length * size * 0.6, height: size, size });
const titleBlock = (number: string) => [word("SHEET", 0.8, 0.88, 0.006), word("NO.", 0.84, 0.88, 0.006), word(number, 0.8, 0.9, 0.02)];

async function threePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage([1190, 842]);
  return Buffer.from(await doc.save());
}

describe("DrawingSetsService", () => {
  let service: DrawingSetsService;
  let files: Map<string, Buffer>;
  let stored: { set?: Record<string, unknown> };
  let prisma: any;
  let projectAccess: { assertAccess: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(() => {
    files = new Map();
    stored = {};
    const storage = {
      save: jest.fn(async (_c: string, name: string, buffer: Buffer) => {
        const storageKey = `k/${files.size}-${name}`;
        files.set(storageKey, buffer);
        return { storageKey, size: buffer.length };
      }),
      read: jest.fn(async (key: string) => files.get(key)),
    };
    let sheetSeq = 0;
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      drawingSheet: {
        // One existing sheet: A-101 at version 2 (chain rooted at a101-v1).
        findMany: jest.fn().mockResolvedValue([
          { id: "a101-v1", sheetNumber: "A-101", title: "Ground floor", discipline: "Architectural", revision: "A", version: 1, rootSheetId: null },
          { id: "a101-v2", sheetNumber: "A-101", title: "Ground floor", discipline: "Architectural", revision: "B", version: 2, rootSheetId: "a101-v1" },
        ]),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: `new-${++sheetSeq}`, ...data })),
      },
      drawingSheetLink: { createMany: jest.fn() },
      drawingSet: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => (stored.set = { id: "set-1", importedAt: null, ...data })),
        findFirst: jest.fn(async () => stored.set ?? null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn(),
      },
    };
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
    projectAccess = { assertAccess: jest.fn() };
    audit = { record: jest.fn() };
    service = new DrawingSetsService(prisma, storage as never, audit as never, projectAccess as never);
  });

  const upload = async () => {
    mockExtract.mockResolvedValue([
      { pageNumber: 1, width: 1190, height: 842, words: [...titleBlock("A-101"), word("5/A-501", 0.2, 0.3)] },
      { pageNumber: 2, width: 1190, height: 842, words: [...titleBlock("A-501"), word("A-101", 0.2, 0.3)] },
      { pageNumber: 3, width: 1190, height: 842, words: [] },
    ]);
    return service.analyze("co", { userId: "u1", name: "Anke" }, "p1", { originalname: "Set.pdf", mimetype: "application/pdf", size: 1000, buffer: await threePagePdf() } as Express.Multer.File);
  };

  it("proposes a sheet per page and flags the number that already exists", async () => {
    const result = await upload();
    expect(result.pageCount).toBe(3);
    expect(result.pages.map((p) => [p.page, p.sheetNumber, p.confidence])).toEqual([
      [1, "A-101", "high"],
      [2, "A-501", "high"],
      [3, null, null],
    ]);
    // Matched to the chain's *current* version, which the import will revise.
    expect(result.pages[0].existingSheet).toEqual({ id: "a101-v2", sheetNumber: "A-101", revision: "B", version: 2 });
    expect(result.pages[1].existingSheet).toBeNull();
    expect(prisma.drawingSheet.create).not.toHaveBeenCalled();
  });

  it("marks a page read from a scan and links nothing from it", async () => {
    mockExtract.mockResolvedValue([{ pageNumber: 1, width: 1190, height: 842, fromScan: true, words: [...titleBlock("A-101"), word("A-501", 0.85, 0.95)] }]);
    const result = await service.analyze("co", { userId: "u1", name: "Anke" }, "p1", { originalname: "Scan.pdf", mimetype: "application/pdf", size: 1000, buffer: await threePagePdf() } as Express.Multer.File);
    expect(mockExtract).toHaveBeenCalledWith(expect.any(Buffer), expect.any(Number), { ocrScans: { maxPages: 60 } });
    expect(result.pages[0]).toMatchObject({ sheetNumber: "A-101", fromScan: true, referenceCount: 0 });
  });

  it("refuses anything but a PDF", async () => {
    await expect(service.analyze("co", { userId: "u1", name: "A" }, "p1", { originalname: "a.png", mimetype: "image/png", size: 1, buffer: Buffer.from("x") } as Express.Multer.File)).rejects.toThrow(BadRequestException);
  });

  it("splits the reviewed pages into single-page sheets, revising an existing number and linking references", async () => {
    await upload();
    const result = await service.import(user, "set-1", {
      pages: [
        { page: 1, sheetNumber: "A-101", revision: "C" },
        { page: 2, sheetNumber: "A-501", title: "Wall sections" },
      ],
    });

    expect(result).toMatchObject({ created: 1, revised: 1 });
    const [revision, fresh] = prisma.drawingSheet.create.mock.calls.map((c: [{ data: Record<string, unknown> }]) => c[0].data);
    expect(revision).toMatchObject({ sheetNumber: "A-101", version: 3, rootSheetId: "a101-v1", revision: "C", title: "Ground floor", sourcePage: 1, drawingSetId: "set-1" });
    expect(fresh).toMatchObject({ sheetNumber: "A-501", title: "Wall sections", sourcePage: 2 });
    expect(fresh.version).toBeUndefined();

    for (const data of [revision, fresh]) {
      const pdf = await PDFDocument.load(files.get(data.storageKey as string)!);
      expect(pdf.getPageCount()).toBe(1);
    }

    const linkCalls = prisma.drawingSheetLink.createMany.mock.calls.map((c: [{ data: { targetKey: string; label: string }[] }]) => c[0].data.map((l) => l.label));
    expect(linkCalls).toEqual([["A-501"], ["A-101"]]);
  });

  it("drops a page's reference to its own number only once that number is confirmed", async () => {
    await upload();
    // At upload the page's number isn't settled yet, so its own title-block "A-501" is kept…
    await service.import(user, "set-1", { pages: [{ page: 2, sheetNumber: "A-501" }] });
    const analysis = (stored.set!.analysis as SetPageAnalysis[])[1];
    expect(analysis.references.map((r) => r.label)).toEqual(["A-501", "A-101"]);
    // …and dropped once the import confirms A-501 as this page's number.
    expect(prisma.drawingSheetLink.createMany.mock.calls[0][0].data.map((l: { label: string }) => l.label)).toEqual(["A-101"]);
  });

  it("refuses two pages with the same number, a page the set doesn't have, and a second import", async () => {
    await upload();
    await expect(service.import(user, "set-1", { pages: [{ page: 1, sheetNumber: "A-101" }, { page: 2, sheetNumber: "a 101" }] })).rejects.toThrow(/both have sheet number/);
    await expect(service.import(user, "set-1", { pages: [{ page: 4, sheetNumber: "X-1" }] })).rejects.toThrow(/no page 4/);

    prisma.drawingSet.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.import(user, "set-1", { pages: [{ page: 1, sheetNumber: "A-101" }] })).rejects.toThrow(ConflictException);
    expect(prisma.drawingSheet.create).not.toHaveBeenCalled();
  });

  it("checks project access on routes keyed by the set's own id", async () => {
    await upload();
    projectAccess.assertAccess.mockRejectedValue(new ForbiddenException());
    await expect(service.get(user, "set-1")).rejects.toThrow(ForbiddenException);
    await expect(service.import(user, "set-1", { pages: [{ page: 1, sheetNumber: "A-101" }] })).rejects.toThrow(ForbiddenException);
    await expect(service.discard(user, "set-1")).rejects.toThrow(ForbiddenException);
    expect(projectAccess.assertAccess).toHaveBeenCalledWith("co", "p1", "u1", "admin");
  });
});
