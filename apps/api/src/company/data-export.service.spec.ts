import { Test } from "@nestjs/testing";
import type { Archiver } from "archiver";
import { DataExportService, toTeamExportRow } from "./data-export.service";
import { PrismaService } from "../common/prisma/prisma.service";

function emptyFindMany() {
  return jest.fn().mockResolvedValue([]);
}

/** Streamed archive entries only finish writing once their source stream ends — collecting into
 * a buffer here (rather than asserting against the live stream) is the simplest way to inspect
 * the finished ZIP's bytes in a test. */
function collectArchive(archive: Archiver): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });
}

describe("DataExportService", () => {
  let service: DataExportService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "company-a", name: "Acme" }) },
      membership: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "m1", role: "owner", emailDigestFrequency: "off", user: { id: "u1", name: "Jane", email: "jane@example.com" } }]),
      },
      client: { findMany: emptyFindMany() },
      project: { findMany: emptyFindMany() },
      estimate: { findMany: emptyFindMany() },
      invoice: { findMany: emptyFindMany() },
      worker: { findMany: emptyFindMany() },
      timeEntry: { findMany: emptyFindMany() },
      document: { findMany: emptyFindMany() },
      punchListItem: { findMany: emptyFindMany() },
      rfi: { findMany: emptyFindMany() },
      warrantyClaim: { findMany: emptyFindMany() },
      dailyLog: { findMany: emptyFindMany() },
      incidentReport: { findMany: emptyFindMany() },
    };

    const module = await Test.createTestingModule({
      providers: [DataExportService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(DataExportService);
  });

  it("produces a real ZIP scoped to the requesting company only", async () => {
    const archive = await service.buildExport("company-a");
    const buffer = await collectArchive(archive);

    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    for (const [model, methods] of Object.entries(prisma)) {
      if (methods.findMany) expect(methods.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "company-a" }) }));
      if (methods.findUniqueOrThrow) expect(methods.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "company-a" } });
    }
    expect(prisma.company.findUniqueOrThrow).toHaveBeenCalled();
  });

  it("includes each expected entity file in the archive", async () => {
    const archive = await service.buildExport("company-a");
    const buffer = await collectArchive(archive);
    const text = buffer.toString("latin1");

    for (const name of [
      "company.json",
      "team.ndjson",
      "clients.ndjson",
      "projects.ndjson",
      "estimates.ndjson",
      "invoices.ndjson",
      "workers.ndjson",
      "time-entries.ndjson",
      "documents.ndjson",
      "punch-list.ndjson",
      "rfis.ndjson",
      "warranty-claims.ndjson",
      "daily-logs.ndjson",
      "incident-reports.ndjson",
    ]) {
      expect(text).toContain(name);
    }
  });
});

describe("toTeamExportRow", () => {
  it("strips the joined User down to id/name/email — no password hash or other internals", () => {
    const row = toTeamExportRow({
      role: "owner",
      emailDigestFrequency: "daily",
      user: { id: "u1", name: "Jane", email: "jane@example.com", passwordHash: "$2b$12$secret" } as never,
    });

    expect(row).toEqual({
      role: "owner",
      emailDigestFrequency: "daily",
      user: { id: "u1", name: "Jane", email: "jane@example.com" },
    });
    expect(row.user).not.toHaveProperty("passwordHash");
  });
});
