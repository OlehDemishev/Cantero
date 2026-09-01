import { Test } from "@nestjs/testing";
import { ProjectsService } from "./projects.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { WeatherService } from "../weather/weather.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { MessageTemplatesService } from "../message-templates/message-templates.service";

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
        { provide: MessageTemplatesService, useValue: { render: jest.fn().mockResolvedValue(null) } },
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
        { provide: MessageTemplatesService, useValue: { render: jest.fn().mockResolvedValue(null) } },
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
        { provide: MessageTemplatesService, useValue: { render: jest.fn().mockResolvedValue(null) } },
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

describe("ProjectsService record-level permissions", () => {
  let service: ProjectsService;
  let prisma: {
    project: { findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    projectMember: { findMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
    membership: { findFirst: jest.Mock };
  };
  let audit: { record: jest.Mock };

  const OPEN = { id: "p-open", restrictedToMembers: false };
  const RESTRICTED = { id: "p-restricted", restrictedToMembers: true };

  beforeEach(async () => {
    prisma = {
      project: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      projectMember: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
      membership: { findFirst: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WeatherService, useValue: {} },
        { provide: AuditService, useValue: audit },
        { provide: MailService, useValue: { send: jest.fn() } },
        { provide: MessageTemplatesService, useValue: { render: jest.fn().mockResolvedValue(null) } },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  describe("list()", () => {
    it("returns every project unfiltered for an internal caller with no userId/role", async () => {
      prisma.project.findMany.mockResolvedValue([OPEN, RESTRICTED]);

      const result = await service.list("company-a");

      expect(result).toEqual([OPEN, RESTRICTED]);
      expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
    });

    it("returns every project unfiltered for an owner/admin", async () => {
      prisma.project.findMany.mockResolvedValue([OPEN, RESTRICTED]);

      const result = await service.list("company-a", "user-1", "owner");

      expect(result).toEqual([OPEN, RESTRICTED]);
      expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
    });

    it("hides a restricted project from a non-member worker", async () => {
      prisma.project.findMany.mockResolvedValue([OPEN, RESTRICTED]);
      prisma.projectMember.findMany.mockResolvedValue([]);

      const result = await service.list("company-a", "user-2", "worker");

      expect(result).toEqual([OPEN]);
    });

    it("shows a restricted project to a member worker", async () => {
      prisma.project.findMany.mockResolvedValue([OPEN, RESTRICTED]);
      prisma.projectMember.findMany.mockResolvedValue([{ projectId: "p-restricted" }]);

      const result = await service.list("company-a", "user-2", "worker");

      expect(result).toEqual([OPEN, RESTRICTED]);
    });
  });

  describe("get()", () => {
    it("throws ForbiddenException for a non-member worker on a restricted project", async () => {
      prisma.project.findFirst.mockResolvedValue(RESTRICTED);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.get("company-a", "p-restricted", "user-2", "worker")).rejects.toThrow("don't have access");
    });

    it("allows a member worker on a restricted project", async () => {
      prisma.project.findFirst.mockResolvedValue(RESTRICTED);
      prisma.projectMember.findUnique.mockResolvedValue({ projectId: "p-restricted", userId: "user-2" });

      const result = await service.get("company-a", "p-restricted", "user-2", "worker");

      expect(result).toEqual(RESTRICTED);
    });

    it("allows an owner without checking membership", async () => {
      prisma.project.findFirst.mockResolvedValue(RESTRICTED);

      const result = await service.get("company-a", "p-restricted", "user-1", "owner");

      expect(result).toEqual(RESTRICTED);
      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("addMember()", () => {
    it("rejects a user who isn't a member of the company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Riverside Reno" });
      prisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.addMember("company-a", { userId: "u1", name: "Owner" }, "p1", "outsider"),
      ).rejects.toThrow("not a member of this company");
      expect(prisma.projectMember.upsert).not.toHaveBeenCalled();
    });

    it("adds the member and audits it", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Riverside Reno" });
      prisma.membership.findFirst.mockResolvedValue({ userId: "u2" });
      prisma.projectMember.upsert.mockResolvedValue({ id: "pm1", user: { id: "u2", name: "Worker Two" } });

      await service.addMember("company-a", { userId: "u1", name: "Owner" }, "p1", "u2");

      expect(prisma.projectMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId_userId: { projectId: "p1", userId: "u2" } } }),
      );
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("setRestricted()", () => {
    it("flips restrictedToMembers and audits the change", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Riverside Reno" });
      prisma.project.update.mockResolvedValue({ id: "p1", restrictedToMembers: true });

      await service.setRestricted("company-a", { userId: "u1", name: "Owner" }, "p1", true);

      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { restrictedToMembers: true } });
      expect(audit.record).toHaveBeenCalled();
    });
  });
});
