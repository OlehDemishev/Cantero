import { Test } from "@nestjs/testing";
import { ProjectsService } from "./projects.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { WeatherService } from "../weather/weather.service";
import { AuditService } from "../common/audit/audit.service";

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
