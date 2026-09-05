import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ProgressTrackingService } from "./progress-tracking.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const PROJECT_A = "project-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("ProgressTrackingService.computeAndSnapshot", () => {
  let service: ProgressTrackingService;
  let prisma: {
    project: { findFirst: jest.Mock };
    document: { findMany: jest.Mock };
    invoice: { findFirst: jest.Mock };
    progressEstimate: { create: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      document: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      progressEstimate: { create: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ProgressTrackingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(ProgressTrackingService);
  });

  it("throws when the project doesn't belong to the caller's company", async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.computeAndSnapshot(COMPANY_A, ACTOR, PROJECT_A)).rejects.toThrow(NotFoundException);
  });

  it("does not flag variance when there is no billed percentComplete to compare against", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Tower" });
    prisma.document.findMany.mockResolvedValue([{ tags: ["framing"] }]);
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.progressEstimate.create.mockImplementation(({ data }) => Promise.resolve({ id: "est-1", ...data }));

    const result = await service.computeAndSnapshot(COMPANY_A, ACTOR, PROJECT_A);

    expect(result.varianceFlagged).toBe(false);
    expect(result.billedPercentComplete).toBeUndefined();
  });

  it("flags variance when the photo estimate diverges from billed percent beyond the threshold", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Tower" });
    prisma.document.findMany.mockResolvedValue([{ tags: ["drywall"] }]); // 60%
    prisma.invoice.findFirst.mockResolvedValue({ percentComplete: "20" });
    prisma.progressEstimate.create.mockImplementation(({ data }) => Promise.resolve({ id: "est-1", ...data }));

    const result = await service.computeAndSnapshot(COMPANY_A, ACTOR, PROJECT_A);

    expect(result.estimatedPercentComplete).toBe(60);
    expect(result.varianceFlagged).toBe(true);
  });

  it("does not flag variance when within the threshold", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Tower" });
    prisma.document.findMany.mockResolvedValue([{ tags: ["drywall"] }]); // 60%
    prisma.invoice.findFirst.mockResolvedValue({ percentComplete: "50" });
    prisma.progressEstimate.create.mockImplementation(({ data }) => Promise.resolve({ id: "est-1", ...data }));

    const result = await service.computeAndSnapshot(COMPANY_A, ACTOR, PROJECT_A);

    expect(result.varianceFlagged).toBe(false);
  });

  it("records an audit entry noting the estimate", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Tower" });
    prisma.document.findMany.mockResolvedValue([]);
    prisma.progressEstimate.create.mockImplementation(({ data }) => Promise.resolve({ id: "est-1", ...data }));

    await service.computeAndSnapshot(COMPANY_A, ACTOR, PROJECT_A);

    expect(audit.record).toHaveBeenCalledWith(COMPANY_A, ACTOR, "progress_estimate.computed", "ProgressEstimate", "est-1", expect.any(String));
  });
});
