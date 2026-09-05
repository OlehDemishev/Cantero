import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { LienComplianceService } from "./lien-compliance.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("LienComplianceService", () => {
  let service: LienComplianceService;
  let prisma: {
    project: { findFirst: jest.Mock };
    lienNotice: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    mechanicsLienFiling: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      lienNotice: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      mechanicsLienFiling: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        LienComplianceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(LienComplianceService);
  });

  describe("createNotice()", () => {
    it("rejects a notice for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.createNotice(COMPANY_A, ACTOR, "proj-1", { direction: "sent", relatedPartyName: "Owner Corp" } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates a notice tied to the project", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "proj-1", name: "Downtown Tower" });
      prisma.lienNotice.create.mockResolvedValue({ id: "notice-1" });

      const result = await service.createNotice(COMPANY_A, ACTOR, "proj-1", {
        direction: "sent",
        relatedPartyName: "Owner Corp",
      } as any);

      expect(result.id).toBe("notice-1");
      expect(prisma.lienNotice.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: COMPANY_A, projectId: "proj-1", direction: "sent" }) }),
      );
    });
  });

  describe("markNoticeSent()", () => {
    it("throws when the notice doesn't exist", async () => {
      prisma.lienNotice.findFirst.mockResolvedValue(null);

      await expect(service.markNoticeSent(COMPANY_A, ACTOR, "notice-1")).rejects.toThrow(NotFoundException);
    });

    it("rejects marking a notice sent twice", async () => {
      prisma.lienNotice.findFirst.mockResolvedValue({ id: "notice-1", sentAt: new Date(), relatedPartyName: "Owner Corp" });

      await expect(service.markNoticeSent(COMPANY_A, ACTOR, "notice-1")).rejects.toThrow(BadRequestException);
    });

    it("stamps sentAt on an unsent notice", async () => {
      prisma.lienNotice.findFirst.mockResolvedValue({ id: "notice-1", sentAt: null, relatedPartyName: "Owner Corp" });
      prisma.lienNotice.update.mockResolvedValue({ id: "notice-1", sentAt: new Date() });

      const result = await service.markNoticeSent(COMPANY_A, ACTOR, "notice-1");

      expect(result.sentAt).toBeTruthy();
    });
  });

  describe("updateFilingStatus()", () => {
    it("throws when the filing doesn't exist", async () => {
      prisma.mechanicsLienFiling.findFirst.mockResolvedValue(null);

      await expect(service.updateFilingStatus(COMPANY_A, ACTOR, "filing-1", { status: "released" })).rejects.toThrow(NotFoundException);
    });

    it("stamps releasedAt when status becomes released", async () => {
      prisma.mechanicsLienFiling.findFirst.mockResolvedValue({ id: "filing-1", status: "filed" });
      prisma.mechanicsLienFiling.update.mockResolvedValue({ id: "filing-1", status: "released", releasedAt: new Date() });

      await service.updateFilingStatus(COMPANY_A, ACTOR, "filing-1", { status: "released" });

      const updateCall = prisma.mechanicsLienFiling.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe("released");
      expect(updateCall.data.releasedAt).toBeInstanceOf(Date);
    });

    it("does not stamp releasedAt for a non-released status", async () => {
      prisma.mechanicsLienFiling.findFirst.mockResolvedValue({ id: "filing-1", status: "filed" });
      prisma.mechanicsLienFiling.update.mockResolvedValue({ id: "filing-1", status: "disputed" });

      await service.updateFilingStatus(COMPANY_A, ACTOR, "filing-1", { status: "disputed" });

      const updateCall = prisma.mechanicsLienFiling.update.mock.calls[0][0];
      expect(updateCall.data.releasedAt).toBeUndefined();
    });
  });

  describe("upcomingDeadlines()", () => {
    it("queries for unsent notices with a deadline within the window", async () => {
      prisma.lienNotice.findMany.mockResolvedValue([]);

      await service.upcomingDeadlines(COMPANY_A, 30);

      const query = prisma.lienNotice.findMany.mock.calls[0][0];
      expect(query.where.companyId).toBe(COMPANY_A);
      expect(query.where.sentAt).toBeNull();
      expect(query.where.deadlineDate.lte).toBeInstanceOf(Date);
    });
  });
});
