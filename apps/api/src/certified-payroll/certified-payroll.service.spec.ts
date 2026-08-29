import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { CertifiedPayrollService } from "./certified-payroll.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const PROJECT_A = "project-a";
const ACTOR = { userId: "user-1", name: "Anke Müller" };

function worker(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "worker-1",
    name: "Jordan Smith",
    hourlyCost: "30.00",
    wageClassification: null,
    ...overrides,
  };
}

describe("CertifiedPayrollService.computeWeek", () => {
  let service: CertifiedPayrollService;
  let prisma: {
    project: { findFirst: jest.Mock };
    timeEntry: { findMany: jest.Mock };
    certifiedPayrollReport: { findUnique: jest.Mock; count: jest.Mock; upsert: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      timeEntry: { findMany: jest.fn() },
      certifiedPayrollReport: { findUnique: jest.fn(), count: jest.fn(), upsert: jest.fn(), findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        CertifiedPayrollService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { read: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(CertifiedPayrollService);
  });

  it("splits hours over the 40-hour weekly threshold into overtime, paid at 1.5x", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A });
    prisma.timeEntry.findMany.mockResolvedValue([
      { workerId: "worker-1", hours: "32", worker: worker() },
      { workerId: "worker-1", hours: "10", worker: worker() },
    ]);

    const result = await service.computeWeek(COMPANY_A, PROJECT_A, new Date("2026-08-29"));

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].regularHours).toBe(40);
    expect(result.lines[0].overtimeHours).toBe(2);
    // 40*30 + 2*30*1.5 = 1200 + 90 = 1290
    expect(result.lines[0].grossPay).toBeCloseTo(1290);
    expect(result.totalGrossPay).toBeCloseTo(1290);
  });

  it("adds the classification's fringe rate per total hour worked, on top of base + OT pay", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A });
    prisma.timeEntry.findMany.mockResolvedValue([
      { workerId: "worker-1", hours: "20", worker: worker({ wageClassification: { trade: "Electrician", hourlyRate: "35.00", fringeRate: "5.00" } }) },
    ]);

    const result = await service.computeWeek(COMPANY_A, PROJECT_A, new Date("2026-08-29"));

    // 20*30 (base pay) + 20*5 (fringe) = 600 + 100 = 700
    expect(result.lines[0].grossPay).toBeCloseTo(700);
    expect(result.lines[0].trade).toBe("Electrician");
  });

  it("flags a worker paid below their trade's prevailing hourly rate", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A });
    prisma.timeEntry.findMany.mockResolvedValue([
      { workerId: "worker-1", hours: "10", worker: worker({ hourlyCost: "20.00", wageClassification: { trade: "Laborer", hourlyRate: "28.00", fringeRate: "0" } }) },
    ]);

    const result = await service.computeWeek(COMPANY_A, PROJECT_A, new Date("2026-08-29"));

    expect(result.lines[0].belowPrevailingRate).toBe(true);
  });

  it("does not flag a worker with no classification assigned, even at a low rate", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A });
    prisma.timeEntry.findMany.mockResolvedValue([{ workerId: "worker-1", hours: "10", worker: worker({ hourlyCost: "5.00" }) }]);

    const result = await service.computeWeek(COMPANY_A, PROJECT_A, new Date("2026-08-29"));

    expect(result.lines[0].belowPrevailingRate).toBe(false);
  });

  it("throws when the project doesn't belong to the caller's company", async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.computeWeek(COMPANY_A, PROJECT_A, new Date("2026-08-29"))).rejects.toThrow(NotFoundException);
  });
});

describe("CertifiedPayrollService.generate", () => {
  let service: CertifiedPayrollService;
  let prisma: {
    project: { findFirst: jest.Mock };
    timeEntry: { findMany: jest.Mock };
    certifiedPayrollReport: { findUnique: jest.Mock; count: jest.Mock; upsert: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: PROJECT_A }) },
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
      certifiedPayrollReport: { findUnique: jest.fn(), count: jest.fn(), upsert: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CertifiedPayrollService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn() } },
        { provide: StorageService, useValue: { read: jest.fn() } },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(CertifiedPayrollService);
  });

  it("assigns the next sequential payroll number for a new report on this project", async () => {
    prisma.certifiedPayrollReport.findUnique.mockResolvedValue(null);
    prisma.certifiedPayrollReport.count.mockResolvedValue(2);
    prisma.certifiedPayrollReport.upsert.mockResolvedValue({ id: "report-1", payrollNumber: 3 });

    await service.generate(COMPANY_A, ACTOR, PROJECT_A, "2026-08-29");

    expect(prisma.certifiedPayrollReport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ payrollNumber: 3 }) }),
    );
  });

  it("keeps the original payroll number when regenerating an already-filed week", async () => {
    prisma.certifiedPayrollReport.findUnique.mockResolvedValue({ id: "report-1", payrollNumber: 1 });
    prisma.certifiedPayrollReport.upsert.mockResolvedValue({ id: "report-1", payrollNumber: 1 });

    await service.generate(COMPANY_A, ACTOR, PROJECT_A, "2026-08-29");

    expect(prisma.certifiedPayrollReport.count).not.toHaveBeenCalled();
    expect(prisma.certifiedPayrollReport.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ payrollNumber: 1 }) }));
  });

  it("records an audit entry after generating a report", async () => {
    prisma.certifiedPayrollReport.findUnique.mockResolvedValue(null);
    prisma.certifiedPayrollReport.count.mockResolvedValue(0);
    prisma.certifiedPayrollReport.upsert.mockResolvedValue({ id: "report-1", payrollNumber: 1 });

    await service.generate(COMPANY_A, ACTOR, PROJECT_A, "2026-08-29");

    expect(audit.record).toHaveBeenCalledWith(COMPANY_A, ACTOR, "certified_payroll.generated", "CertifiedPayrollReport", "report-1", expect.any(String));
  });
});
