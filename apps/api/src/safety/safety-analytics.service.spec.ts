import { Test } from "@nestjs/testing";
import { SafetyAnalyticsService } from "./safety-analytics.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";

const COMPANY_A = "company-a";

function incident(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "incident-1",
    companyId: COMPANY_A,
    projectId: "project-1",
    project: { id: "project-1", name: "Site A" },
    occurredAt: new Date("2026-03-15T00:00:00.000Z"),
    severity: "medical_treatment",
    description: "Fall from ladder",
    oshaRecordable: true,
    oshaCaseType: "injury",
    daysAwayFromWork: 0,
    daysJobTransferOrRestriction: 0,
    ...overrides,
  };
}

describe("SafetyAnalyticsService", () => {
  let service: SafetyAnalyticsService;
  let prisma: {
    incidentReport: { findMany: jest.Mock };
    timeEntry: { groupBy: jest.Mock; aggregate: jest.Mock };
    project: { findMany: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      incidentReport: { findMany: jest.fn() },
      timeEntry: { groupBy: jest.fn(), aggregate: jest.fn() },
      project: { findMany: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        SafetyAnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn().mockResolvedValue(Buffer.from("pdf")) } },
        { provide: StorageService, useValue: { read: jest.fn() } },
      ],
    }).compile();

    service = module.get(SafetyAnalyticsService);
  });

  describe("osha300aSummary()", () => {
    it("buckets a fatal case as a death even when days-away is also set", async () => {
      prisma.incidentReport.findMany.mockResolvedValue([incident({ severity: "fatality", daysAwayFromWork: 5 })]);

      const result = await service.osha300aSummary(COMPANY_A, 2026);

      expect(result.deaths).toBe(1);
      expect(result.daysAwayCases).toBe(0);
      expect(result.totalRecordableCases).toBe(1);
    });

    it("buckets a case with days away from work correctly and sums total days", async () => {
      prisma.incidentReport.findMany.mockResolvedValue([
        incident({ daysAwayFromWork: 3 }),
        incident({ id: "incident-2", daysAwayFromWork: 2 }),
      ]);

      const result = await service.osha300aSummary(COMPANY_A, 2026);

      expect(result.daysAwayCases).toBe(2);
      expect(result.totalDaysAway).toBe(5);
    });

    it("counts a case with neither days-away nor job-transfer as other-recordable", async () => {
      prisma.incidentReport.findMany.mockResolvedValue([incident({ daysAwayFromWork: 0, daysJobTransferOrRestriction: 0 })]);

      const result = await service.osha300aSummary(COMPANY_A, 2026);

      expect(result.otherRecordableCases).toBe(1);
      expect(result.daysAwayCases).toBe(0);
      expect(result.jobTransferCases).toBe(0);
    });

    it("tallies cases by osha case type", async () => {
      prisma.incidentReport.findMany.mockResolvedValue([
        incident({ oshaCaseType: "injury" }),
        incident({ id: "incident-2", oshaCaseType: "hearing_loss" }),
      ]);

      const result = await service.osha300aSummary(COMPANY_A, 2026);

      expect(result.byCaseType.injury).toBe(1);
      expect(result.byCaseType.hearing_loss).toBe(1);
      expect(result.byCaseType.poisoning).toBe(0);
    });

    it("scopes the query to the given calendar year", async () => {
      prisma.incidentReport.findMany.mockResolvedValue([]);

      await service.osha300aSummary(COMPANY_A, 2026);

      const call = prisma.incidentReport.findMany.mock.calls[0][0];
      expect(call.where.occurredAt).toEqual({ gte: new Date(Date.UTC(2026, 0, 1)), lt: new Date(Date.UTC(2027, 0, 1)) });
      expect(call.where.oshaRecordable).toBe(true);
    });
  });

  describe("safetyScorecard()", () => {
    it("computes TRIR from recordable cases and total hours worked", async () => {
      prisma.incidentReport.findMany.mockResolvedValue([incident(), incident({ id: "i2", oshaRecordable: false })]);
      prisma.timeEntry.groupBy.mockResolvedValue([{ projectId: "project-1", _sum: { hours: 1000 } }]);
      prisma.timeEntry.aggregate.mockResolvedValue({ _sum: { hours: 1000 } });
      prisma.project.findMany.mockResolvedValue([{ id: "project-1", name: "Site A" }]);

      const result = await service.safetyScorecard(COMPANY_A, 2026);

      // 1 recordable case * 200,000 / 1000 hours = 200
      expect(result.companyTrir).toBe(200);
      expect(result.recordableCount).toBe(1);
      expect(result.totalIncidents).toBe(2);
    });

    it("returns null TRIR instead of a misleading zero when no hours were logged", async () => {
      prisma.incidentReport.findMany.mockResolvedValue([]);
      prisma.timeEntry.groupBy.mockResolvedValue([]);
      prisma.timeEntry.aggregate.mockResolvedValue({ _sum: { hours: null } });
      prisma.project.findMany.mockResolvedValue([]);

      const result = await service.safetyScorecard(COMPANY_A, 2026);

      expect(result.companyTrir).toBeNull();
    });

    it("buckets incidents into their occurrence month for the trend", async () => {
      prisma.incidentReport.findMany.mockResolvedValue([incident({ occurredAt: new Date("2026-06-10T00:00:00.000Z") })]);
      prisma.timeEntry.groupBy.mockResolvedValue([]);
      prisma.timeEntry.aggregate.mockResolvedValue({ _sum: { hours: null } });
      prisma.project.findMany.mockResolvedValue([]);

      const result = await service.safetyScorecard(COMPANY_A, 2026);

      expect(result.monthlyTrend[5].totalIncidents).toBe(1);
      expect(result.monthlyTrend[5].month).toBe(6);
      expect(result.monthlyTrend[0].totalIncidents).toBe(0);
    });
  });
});
