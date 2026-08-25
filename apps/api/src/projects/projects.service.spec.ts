import { Test } from "@nestjs/testing";
import { ProjectsService } from "./projects.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { WeatherService } from "../weather/weather.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";

describe("ProjectsService.importCsv", () => {
  let service: ProjectsService;
  let prisma: {
    client: { findMany: jest.Mock };
    project: { createMany: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: { findMany: jest.fn().mockResolvedValue([]) },
      project: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WeatherService, useValue: {} },
        { provide: AuditService, useValue: audit },
        { provide: MailService, useValue: { send: jest.fn() } },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  it("skips a row with no name and records the error", async () => {
    const csv = "name,address,client\n,123 Main St,Acme Corp\n";

    const result = await service.importCsv("company-a", { userId: "user-1", name: "Jane" }, csv);

    expect(result).toEqual({ created: 0, skipped: 1, errors: [{ row: 2, message: "Missing name" }] });
    expect(prisma.project.createMany).not.toHaveBeenCalled();
  });

  it("resolves a client by case-insensitive name match", async () => {
    prisma.client.findMany.mockResolvedValue([{ id: "client-1", name: "Acme Corp" }]);
    const csv = "name,address,client\nRiverside Reno,1 River Rd,acme corp\n";

    const result = await service.importCsv("company-a", { userId: "user-1", name: "Jane" }, csv);

    expect(result.created).toBe(1);
    expect(prisma.project.createMany).toHaveBeenCalledWith({
      data: [{ name: "Riverside Reno", address: "1 River Rd", clientId: "client-1", companyId: "company-a" }],
    });
  });

  it("still creates the project when the client name doesn't match anything, rather than failing the row", async () => {
    prisma.client.findMany.mockResolvedValue([{ id: "client-1", name: "Acme Corp" }]);
    const csv = "name,address,client\nRiverside Reno,1 River Rd,Nonexistent Co\n";

    const result = await service.importCsv("company-a", { userId: "user-1", name: "Jane" }, csv);

    expect(result.created).toBe(1);
    expect(result.errors).toEqual([]);
    expect(prisma.project.createMany).toHaveBeenCalledWith({
      data: [{ name: "Riverside Reno", address: "1 River Rd", clientId: null, companyId: "company-a" }],
    });
  });

  it("creates a project from name alone when address/client are omitted", async () => {
    const csv = "name\nRiverside Reno\n";

    const result = await service.importCsv("company-a", { userId: "user-1", name: "Jane" }, csv);

    expect(result.created).toBe(1);
    expect(prisma.project.createMany).toHaveBeenCalledWith({
      data: [{ name: "Riverside Reno", address: null, clientId: null, companyId: "company-a" }],
    });
  });

  it("audits the import with the created/skipped counts", async () => {
    const csv = "name\nRiverside Reno\n";

    await service.importCsv("company-a", { userId: "user-1", name: "Jane" }, csv);

    expect(audit.record).toHaveBeenCalledWith(
      "company-a",
      { userId: "user-1", name: "Jane" },
      "projects.imported",
      "Company",
      "company-a",
      expect.stringContaining("Imported 1 projects"),
    );
  });
});

describe("ProjectsService.requestReview", () => {
  let service: ProjectsService;
  let prisma: {
    project: { findFirst: jest.Mock; update: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let mail: { send: jest.Mock };

  const ACTOR = { userId: "user-1", name: "Jane" };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn(), update: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
    };
    audit = { record: jest.fn() };
    mail = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WeatherService, useValue: {} },
        { provide: AuditService, useValue: audit },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  it("refuses when no review link is configured", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Riverside Reno", client: { email: "c@x.com", name: "Client" } });
    prisma.company.findUniqueOrThrow.mockResolvedValue({ reviewRequestUrl: null, name: "Acme" });

    await expect(service.requestReview("company-a", ACTOR, "p1")).rejects.toThrow("Set a review link");
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("refuses when the client has no email on file", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Riverside Reno", client: { email: null, name: "Client" } });
    prisma.company.findUniqueOrThrow.mockResolvedValue({ reviewRequestUrl: "https://g.page/r/x", name: "Acme" });

    await expect(service.requestReview("company-a", ACTOR, "p1")).rejects.toThrow("no email on file");
  });

  it("emails the client and stamps reviewRequestedAt when everything is configured", async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: "p1",
      name: "Riverside Reno",
      client: { email: "c@x.com", name: "Client" },
    });
    prisma.company.findUniqueOrThrow.mockResolvedValue({ reviewRequestUrl: "https://g.page/r/x", name: "Acme" });
    prisma.project.update.mockResolvedValue({ id: "p1", reviewRequestedAt: new Date() });

    await service.requestReview("company-a", ACTOR, "p1");

    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "c@x.com" }));
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" }, data: { reviewRequestedAt: expect.any(Date) } }),
    );
    expect(audit.record).toHaveBeenCalled();
  });
});

describe("ProjectsService.gallery", () => {
  let service: ProjectsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    document: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      document: { findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WeatherService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: MailService, useValue: { send: jest.fn() } },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  it("splits documents into before/after by category", async () => {
    prisma.document.findMany.mockResolvedValueOnce([{ id: "d1" }]).mockResolvedValueOnce([{ id: "d2" }]);

    const result = await service.gallery("company-a", "p1");

    expect(result).toEqual({ before: [{ id: "d1" }], after: [{ id: "d2" }] });
    expect(prisma.document.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ category: "gallery_before" }) }),
    );
    expect(prisma.document.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ category: "gallery_after" }) }),
    );
  });
});
