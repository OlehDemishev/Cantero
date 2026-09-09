import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { IncidentReportsService } from "./incident-reports.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Foreman" };
const projectAccessStub = { assertAccess: jest.fn(), filterAccessible: jest.fn(async (rows: unknown[]) => rows) };

describe("IncidentReportsService", () => {
  let service: IncidentReportsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    incidentReport: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let webhooks: { trigger: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      incidentReport: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };
    audit = { record: jest.fn() };
    webhooks = { trigger: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        IncidentReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: WebhooksService, useValue: webhooks },
        { provide: PdfService, useValue: { render: jest.fn(), renderTextDocument: jest.fn() } },
        { provide: StorageService, useValue: { read: jest.fn() } },
        { provide: ProjectAccessService, useValue: projectAccessStub },
      ],
    }).compile();

    service = module.get(IncidentReportsService);
  });

  describe("create()", () => {
    it("rejects when the project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          occurredAt: "2026-08-20T00:00:00.000Z",
          severity: "near_miss",
          description: "Loose scaffold plank",
          oshaRecordable: false,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.incidentReport.create).not.toHaveBeenCalled();
    });

    it("records the reporting actor and audits the entry", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
      prisma.incidentReport.create.mockResolvedValue({ id: "incident-1", severity: "first_aid" });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        occurredAt: "2026-08-20T00:00:00.000Z",
        severity: "first_aid",
        description: "Minor cut from sheet metal",
        oshaRecordable: true,
        oshaCaseType: "injury",
      });

      expect(prisma.incidentReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reportedByUserId: "user-1",
            reportedByName: "Foreman",
            severity: "first_aid",
            oshaRecordable: true,
            oshaCaseType: "injury",
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalled();
      expect(webhooks.trigger).toHaveBeenCalledWith(
        COMPANY_A,
        "safety_incident.logged",
        expect.objectContaining({ incidentId: "incident-1", severity: "first_aid" }),
      );
    });
  });

  describe("update()", () => {
    it("rejects when the report does not belong to this company", async () => {
      prisma.incidentReport.findFirst.mockResolvedValue(null);

      await expect(service.update(COMPANY_A, "incident-1", { correctiveActions: "Replaced plank" })).rejects.toThrow(NotFoundException);
      expect(prisma.incidentReport.update).not.toHaveBeenCalled();
    });
  });

  describe("exportCsv()", () => {
    it("includes the OSHA recordability columns in the export", async () => {
      prisma.incidentReport.findMany.mockResolvedValue([
        {
          occurredAt: new Date("2026-08-20T00:00:00.000Z"),
          project: { name: "Site A" },
          location: "3rd floor",
          severity: "medical_treatment",
          description: "Fall from ladder",
          involvedPersons: "J. Doe",
          correctiveActions: "Replaced ladder",
          oshaRecordable: true,
          oshaCaseType: "injury",
          daysAwayFromWork: 3,
          daysJobTransferOrRestriction: null,
          reportedByName: "Foreman",
        },
      ]);

      const csv = await service.exportCsv(COMPANY_A);

      expect(csv).toContain("OSHA Recordable");
      expect(csv).toContain("Yes");
      expect(csv).toContain("injury");
      expect(csv).toContain("3");
    });
  });

  describe("get() — project access", () => {
    it("checks project access for the report's own project when fetched by id", async () => {
      prisma.incidentReport.findFirst.mockResolvedValue({ id: "inc-1", projectId: "project-1", companyId: COMPANY_A });

      await service.get(COMPANY_A, "inc-1", "user-2", "worker");

      expect(projectAccessStub.assertAccess).toHaveBeenCalledWith(COMPANY_A, "project-1", "user-2", "worker");
    });

    it("propagates a rejection from ProjectAccessService instead of returning the report", async () => {
      prisma.incidentReport.findFirst.mockResolvedValue({ id: "inc-1", projectId: "project-1", companyId: COMPANY_A });
      projectAccessStub.assertAccess.mockRejectedValueOnce(new Error("no access"));

      await expect(service.get(COMPANY_A, "inc-1", "user-2", "worker")).rejects.toThrow("no access");
    });
  });
});
