import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { EnvironmentalService } from "./environmental.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("EnvironmentalService", () => {
  let service: EnvironmentalService;
  let prisma: {
    project: { findFirst: jest.Mock };
    stormwaterPermit: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    bmpInspection: { create: jest.Mock };
    environmentalIncident: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      stormwaterPermit: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      bmpInspection: { create: jest.fn() },
      environmentalIncident: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        EnvironmentalService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(EnvironmentalService);
  });

  describe("fileNoticeOfTermination()", () => {
    it("throws when the permit doesn't exist", async () => {
      prisma.stormwaterPermit.findFirst.mockResolvedValue(null);

      await expect(
        service.fileNoticeOfTermination(COMPANY_A, ACTOR, "permit-1", { notFiledAt: "2026-01-01T00:00:00.000Z" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects filing a notice of termination on an already-inactive permit", async () => {
      prisma.stormwaterPermit.findFirst.mockResolvedValue({ id: "permit-1", active: false });

      await expect(
        service.fileNoticeOfTermination(COMPANY_A, ACTOR, "permit-1", { notFiledAt: "2026-01-01T00:00:00.000Z" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("deactivates an active permit", async () => {
      prisma.stormwaterPermit.findFirst.mockResolvedValue({ id: "permit-1", active: true });
      prisma.stormwaterPermit.update.mockResolvedValue({ id: "permit-1", active: false });

      const result = await service.fileNoticeOfTermination(COMPANY_A, ACTOR, "permit-1", { notFiledAt: "2026-01-01T00:00:00.000Z" });

      expect(result.active).toBe(false);
      const updateCall = prisma.stormwaterPermit.update.mock.calls[0][0];
      expect(updateCall.data.active).toBe(false);
    });
  });

  describe("reportIncident()", () => {
    it("rejects an incident for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.reportIncident(COMPANY_A, ACTOR, "proj-1", { description: "Spill", severity: "minor" } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates an incident tied to the project", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "proj-1", name: "Downtown Tower" });
      prisma.environmentalIncident.create.mockResolvedValue({ id: "incident-1" });

      const result = await service.reportIncident(COMPANY_A, ACTOR, "proj-1", { description: "Spill", severity: "moderate" } as any);

      expect(result.id).toBe("incident-1");
    });
  });

  describe("updateIncidentStatus()", () => {
    it("throws when the incident doesn't exist", async () => {
      prisma.environmentalIncident.findFirst.mockResolvedValue(null);

      await expect(service.updateIncidentStatus(COMPANY_A, ACTOR, "incident-1", { status: "contained" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("stamps containedAt when status becomes contained", async () => {
      prisma.environmentalIncident.findFirst.mockResolvedValue({ id: "incident-1", status: "open" });
      prisma.environmentalIncident.update.mockResolvedValue({ id: "incident-1", status: "contained" });

      await service.updateIncidentStatus(COMPANY_A, ACTOR, "incident-1", { status: "contained" });

      const updateCall = prisma.environmentalIncident.update.mock.calls[0][0];
      expect(updateCall.data.containedAt).toBeInstanceOf(Date);
    });

    it("does not stamp containedAt for a non-contained status", async () => {
      prisma.environmentalIncident.findFirst.mockResolvedValue({ id: "incident-1", status: "open" });
      prisma.environmentalIncident.update.mockResolvedValue({ id: "incident-1", status: "resolved" });

      await service.updateIncidentStatus(COMPANY_A, ACTOR, "incident-1", { status: "resolved" });

      const updateCall = prisma.environmentalIncident.update.mock.calls[0][0];
      expect(updateCall.data.containedAt).toBeUndefined();
    });
  });
});
