import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { IncidentReportsService } from "./incident-reports.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Foreman" };

describe("IncidentReportsService", () => {
  let service: IncidentReportsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    incidentReport: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      incidentReport: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        IncidentReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
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
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.incidentReport.create).not.toHaveBeenCalled();
    });

    it("records the reporting actor and audits the entry", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
      prisma.incidentReport.create.mockResolvedValue({ id: "incident-1" });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        occurredAt: "2026-08-20T00:00:00.000Z",
        severity: "first_aid",
        description: "Minor cut from sheet metal",
      });

      expect(prisma.incidentReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reportedByUserId: "user-1", reportedByName: "Foreman", severity: "first_aid" }),
        }),
      );
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("update()", () => {
    it("rejects when the report does not belong to this company", async () => {
      prisma.incidentReport.findFirst.mockResolvedValue(null);

      await expect(service.update(COMPANY_A, "incident-1", { correctiveActions: "Replaced plank" })).rejects.toThrow(NotFoundException);
      expect(prisma.incidentReport.update).not.toHaveBeenCalled();
    });
  });
});
