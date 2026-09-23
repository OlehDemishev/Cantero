import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { PDFDocument } from "pdf-lib";
import type { AuthUser } from "@cantero/shared";
import { DrawingSetsService, type DrawingSetJob, type SetPageAnalysis } from "./drawing-sets.service";
import type { PageWord } from "./pdf-text";

// pdf.js can't load under Jest; sheet-recognition.spec.ts runs the real extraction in Node. Under
// Jest analyzePdf() runs in-process (no compiled worker file), so these mocks reach it.
const mockExtract = jest.fn();
const mockPageCount = jest.fn();
jest.mock("./pdf-text", () => ({
  extractPdfText: (...args: unknown[]) => mockExtract(...args),
  pdfPageCount: (...args: unknown[]) => mockPageCount(...args),
}));

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
  let sets: Map<string, Record<string, unknown>>;
  let jobs: DrawingSetJob[];
  let prisma: any;
  let projectAccess: { assertAccess: jest.Mock };
  let audit: { record: jest.Mock };

  /** Runs what the queue holds, the way DrawingSetsProcessor does. */
  const drain = async () => {
    while (jobs.length) {
      const job = jobs.shift()!;
      if (job.kind === "analyze") await service.runAnalysis(job.setId);
      else if (job.kind === "import") await service.runImport(job.setId);
      else await service.backfillLinks();
    }
  };
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (v && typeof v === "object" && "in" in v ? (v.in as unknown[]).includes(row[k]) : row[k] === v));

  beforeEach(() => {
    files = new Map();
    sets = new Map();
    jobs = [];
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
        update: jest.fn(),
      },
      drawingSheetLink: { createMany: jest.fn() },
      drawingSet: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `set-${sets.size + 1}`, importedAt: null, pagesRead: 0, error: null, importPages: null, importResult: null, createdAt: new Date(), ...data };
          sets.set(row.id as string, row);
          return row;
        }),
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) => sets.get(where.id) ?? null),
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => sets.get(where.id) ?? null),
        findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => [...sets.values()].filter((r) => matches(r, where))),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(sets.get(where.id)!, data)),
        updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const hit = [...sets.values()].filter((r) => matches(r, where));
          hit.forEach((r) => Object.assign(r, data));
          return { count: hit.length };
        }),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => sets.delete(where.id)),
      },
    };
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
    projectAccess = { assertAccess: jest.fn() };
    audit = { record: jest.fn() };
    const queue = { add: jest.fn(async (_name: string, data: DrawingSetJob) => jobs.push(data)) };
    service = new DrawingSetsService(prisma, storage as never, audit as never, projectAccess as never, queue as never);
    mockExtract.mockReset();
    mockPageCount.mockReset().mockResolvedValue(3);
  });

  const upload = async () => {
    mockExtract.mockResolvedValue([
      { pageNumber: 1, width: 1190, height: 842, words: [...titleBlock("A-101"), word("5/A-501", 0.2, 0.3)] },
      { pageNumber: 2, width: 1190, height: 842, words: [...titleBlock("A-501"), word("A-101", 0.2, 0.3)] },
      { pageNumber: 3, width: 1190, height: 842, words: [] },
    ]);
    return service.analyze("co", { userId: "u1", name: "Anke" }, "p1", { originalname: "Set.pdf", mimetype: "application/pdf", size: 1000, buffer: await threePagePdf() } as Express.Multer.File);
  };
  /** Uploaded and read: the set waiting for review. */
  const readySet = async () => {
    const queued = await upload();
    await drain();
    return service.get(user, queued.id);
  };

  it("answers the upload at once and reads the pages in the background", async () => {
    const queued = await upload();
    expect(queued).toMatchObject({ status: "analyzing", pageCount: 0, pages: [] });
    expect(jobs).toEqual([{ kind: "analyze", setId: queued.id }]);
    expect(mockExtract).not.toHaveBeenCalled();

    await drain();
    const result = await service.get(user, queued.id);
    expect(result).toMatchObject({ status: "ready", pageCount: 3, pagesRead: 3 });
    expect(result.pages.map((p) => [p.page, p.sheetNumber, p.confidence])).toEqual([
      [1, "A-101", "high"],
      [2, "A-501", "high"],
      [3, null, null],
    ]);
    // Matched to the chain's *current* version, which the import will revise.
    expect(result.pages[0].existingSheet).toEqual({ id: "a101-v2", sheetNumber: "A-101", revision: "B", version: 2 });
    expect(result.pages[1].existingSheet).toBeNull();
    expect(prisma.drawingSheet.create).not.toHaveBeenCalled();
    expect(await service.listOpen(user, "p1")).toEqual([expect.objectContaining({ id: queued.id, status: "ready" })]);
  });

  it("records reading progress as pages come in", async () => {
    mockExtract.mockImplementation(async (_pdf: unknown, _max: number, options: { onPage: (done: number, total: number) => void }) => {
      options.onPage(1, 3);
      options.onPage(3, 3);
      return [];
    });
    await service.analyze("co", { userId: "u1", name: "Anke" }, "p1", { originalname: "Set.pdf", mimetype: "application/pdf", size: 1000, buffer: await threePagePdf() } as Express.Multer.File);
    await drain();
    const progress = prisma.drawingSet.update.mock.calls.map((c: [{ data: { pagesRead?: number; status?: string } }]) => c[0].data);
    expect(progress).toEqual(expect.arrayContaining([{ pagesRead: 0, pageCount: 3 }, { pagesRead: 3, pageCount: 3 }]));
  });

  it("marks a page read from a scan and links nothing from it", async () => {
    mockExtract.mockResolvedValue([{ pageNumber: 1, width: 1190, height: 842, fromScan: true, words: [...titleBlock("A-101"), word("A-501", 0.85, 0.95)] }]);
    const queued = await service.analyze("co", { userId: "u1", name: "Anke" }, "p1", { originalname: "Scan.pdf", mimetype: "application/pdf", size: 1000, buffer: await threePagePdf() } as Express.Multer.File);
    await drain();
    expect(mockExtract).toHaveBeenCalledWith(expect.any(Buffer), 600, expect.objectContaining({ ocrScans: { maxPages: 300 } }));
    const result = await service.get(user, queued.id);
    expect(result.pages[0]).toMatchObject({ sheetNumber: "A-101", fromScan: true, referenceCount: 0 });
  });

  it("fails a set it can't read or that is too long, with a reason, without retrying", async () => {
    mockPageCount.mockRejectedValueOnce(new Error("Invalid PDF structure"));
    const broken = await upload();
    mockPageCount.mockResolvedValueOnce(601);
    const long = await upload();
    await drain();
    expect(await service.get(user, broken.id)).toMatchObject({ status: "failed", error: "unreadable", pages: [] });
    expect(await service.get(user, long.id)).toMatchObject({ status: "failed", error: "too-large" });
    expect(mockExtract).not.toHaveBeenCalled();
    // A failed set can be discarded.
    await service.discard(user, broken.id);
    expect(sets.has(broken.id)).toBe(false);
  });

  it("refuses anything but a PDF", async () => {
    await expect(service.analyze("co", { userId: "u1", name: "A" }, "p1", { originalname: "a.png", mimetype: "image/png", size: 1, buffer: Buffer.from("x") } as Express.Multer.File)).rejects.toThrow(BadRequestException);
    expect(jobs).toEqual([]);
  });

  it("splits the reviewed pages into single-page sheets in the background, revising an existing number and linking references", async () => {
    const set = await readySet();
    const queued = await service.import(user, set.id, {
      pages: [
        { page: 1, sheetNumber: "A-101", revision: "C" },
        { page: 2, sheetNumber: "A-501", title: "Wall sections" },
      ],
    });
    expect(queued.status).toBe("importing");
    expect(prisma.drawingSheet.create).not.toHaveBeenCalled();

    await drain();
    expect(await service.get(user, set.id)).toMatchObject({ status: "imported", importResult: { created: 1, revised: 1 } });
    const [revision, fresh] = prisma.drawingSheet.create.mock.calls.map((c: [{ data: Record<string, unknown> }]) => c[0].data);
    expect(revision).toMatchObject({ sheetNumber: "A-101", version: 3, rootSheetId: "a101-v1", revision: "C", title: "Ground floor", sourcePage: 1, drawingSetId: set.id });
    expect(fresh).toMatchObject({ sheetNumber: "A-501", title: "Wall sections", sourcePage: 2 });
    expect(fresh.version).toBeUndefined();
    expect(fresh.linksScannedAt).toBeInstanceOf(Date);

    for (const data of [revision, fresh]) {
      const pdf = await PDFDocument.load(files.get(data.storageKey as string)!);
      expect(pdf.getPageCount()).toBe(1);
    }

    const linkCalls = prisma.drawingSheetLink.createMany.mock.calls.map((c: [{ data: { targetKey: string; label: string }[] }]) => c[0].data.map((l) => l.label));
    expect(linkCalls).toEqual([["A-501"], ["A-101"]]);
    expect(audit.record).toHaveBeenCalledWith("co", { userId: "u1", name: "Anke" }, "drawing_set.imported", "DrawingSet", set.id, expect.stringContaining("1 new, 1 revised"));
    expect(await service.listOpen(user, "p1")).toEqual([]);
  });

  it("drops a page's reference to its own number only once that number is confirmed", async () => {
    const set = await readySet();
    // At upload the page's number isn't settled yet, so its own title-block "A-501" is kept…
    await service.import(user, set.id, { pages: [{ page: 2, sheetNumber: "A-501" }] });
    await drain();
    const analysis = (sets.get(set.id)!.analysis as SetPageAnalysis[])[1];
    expect(analysis.references.map((r) => r.label)).toEqual(["A-501", "A-101"]);
    // …and dropped once the import confirms A-501 as this page's number.
    expect(prisma.drawingSheetLink.createMany.mock.calls[0][0].data.map((l: { label: string }) => l.label)).toEqual(["A-101"]);
  });

  it("refuses two pages with the same number, a page the set doesn't have, an unread set, and a second import", async () => {
    const unread = await upload();
    await expect(service.import(user, unread.id, { pages: [{ page: 1, sheetNumber: "A-101" }] })).rejects.toThrow(/hasn't been read/);
    await drain();

    await expect(service.import(user, unread.id, { pages: [{ page: 1, sheetNumber: "A-101" }, { page: 2, sheetNumber: "a 101" }] })).rejects.toThrow(/both have sheet number/);
    await expect(service.import(user, unread.id, { pages: [{ page: 4, sheetNumber: "X-1" }] })).rejects.toThrow(/no page 4/);

    await service.import(user, unread.id, { pages: [{ page: 1, sheetNumber: "A-101" }] });
    await expect(service.import(user, unread.id, { pages: [{ page: 1, sheetNumber: "A-101" }] })).rejects.toThrow(ConflictException);
    expect(jobs.filter((j) => j.kind === "import")).toHaveLength(1);
    await expect(service.discard(user, unread.id)).rejects.toThrow(/being imported/);
  });

  it("puts a set whose split failed back up for review", async () => {
    const set = await readySet();
    await service.import(user, set.id, { pages: [{ page: 1, sheetNumber: "A-101" }] });
    prisma.$transaction.mockRejectedValueOnce(new Error("connection reset"));
    await drain();
    expect(await service.get(user, set.id)).toMatchObject({ status: "ready", error: "import-failed" });
    expect(sets.get(set.id)!.importedAt).toBeNull();
  });

  it("reads links on sheets uploaded before links were read, once, in batches", async () => {
    files.set("old.pdf", Buffer.from("%PDF"));
    prisma.drawingSheet.findMany.mockResolvedValueOnce([
      { id: "old-1", sheetNumber: "A-101", storageKey: "old.pdf", mimeType: "application/pdf" },
      { id: "photo-1", sheetNumber: "P-1", storageKey: "old.pdf", mimeType: "image/jpeg" },
    ]);
    mockExtract.mockResolvedValueOnce([{ pageNumber: 1, width: 1190, height: 842, words: [word("5/A-501", 0.2, 0.3), word("A-101", 0.8, 0.9)] }]);
    expect(await service.backfillLinks()).toBe(false);
    expect(prisma.drawingSheetLink.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ sheetId: "old-1", targetKey: "A501" })] });
    // Both are marked done — the photo has nothing to read, and isn't looked at again.
    expect(prisma.drawingSheet.update.mock.calls.map((c: [{ where: { id: string } }]) => c[0].where.id)).toEqual(["old-1", "photo-1"]);
  });

  it("checks project access on routes keyed by the set's own id", async () => {
    const set = await readySet();
    projectAccess.assertAccess.mockRejectedValue(new ForbiddenException());
    await expect(service.get(user, set.id)).rejects.toThrow(ForbiddenException);
    await expect(service.import(user, set.id, { pages: [{ page: 1, sheetNumber: "A-101" }] })).rejects.toThrow(ForbiddenException);
    await expect(service.discard(user, set.id)).rejects.toThrow(ForbiddenException);
    await expect(service.listOpen(user, "p1")).rejects.toThrow(ForbiddenException);
    expect(projectAccess.assertAccess).toHaveBeenCalledWith("co", "p1", "u1", "admin");
  });
});
