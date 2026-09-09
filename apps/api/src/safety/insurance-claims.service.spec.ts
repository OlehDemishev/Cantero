import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { InsuranceClaimsService } from "./insurance-claims.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { OutboxService } from "../common/webhooks/outbox.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("InsuranceClaimsService", () => {
  let service: InsuranceClaimsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    incidentReport: { findFirst: jest.Mock };
    insuranceClaim: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let outbox: { enqueue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      incidentReport: { findFirst: jest.fn() },
      insuranceClaim: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    audit = { record: jest.fn() };
    outbox = { enqueue: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        InsuranceClaimsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OutboxService, useValue: outbox },
      ],
    }).compile();

    service = module.get(InsuranceClaimsService);
  });

  describe("create()", () => {
    it("allows a claim with no project and no linked incident (e.g. a standalone property claim)", async () => {
      prisma.insuranceClaim.create.mockResolvedValue({ id: "claim-1", claimType: "property" });

      await service.create(COMPANY_A, ACTOR, {
        claimType: "property",
        insurerName: "Allianz",
        dateFiled: "2026-08-20T00:00:00.000Z",
        description: "Storm damage to site office roof",
      });

      expect(prisma.project.findFirst).not.toHaveBeenCalled();
      expect(prisma.insuranceClaim.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ projectId: undefined, incidentReportId: undefined }) }),
      );
    });

    it("rejects when the given project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          claimType: "workers_comp",
          insurerName: "Allianz",
          dateFiled: "2026-08-20T00:00:00.000Z",
          description: "Fall from ladder",
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.insuranceClaim.create).not.toHaveBeenCalled();
    });

    it("rejects when the linked incident report does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.incidentReport.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          incidentReportId: "incident-1",
          claimType: "workers_comp",
          insurerName: "Allianz",
          dateFiled: "2026-08-20T00:00:00.000Z",
          description: "Fall from ladder",
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.insuranceClaim.create).not.toHaveBeenCalled();
    });

    it("records the filing actor and audits the entry", async () => {
      prisma.insuranceClaim.create.mockResolvedValue({ id: "claim-1", claimType: "workers_comp" });

      await service.create(COMPANY_A, ACTOR, {
        claimType: "workers_comp",
        insurerName: "Allianz",
        dateFiled: "2026-08-20T00:00:00.000Z",
        description: "Fall from ladder",
        claimAmount: 5000,
      });

      expect(prisma.insuranceClaim.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdByUserId: "user-1", createdByName: "Owner", claimAmount: 5000 }),
        }),
      );
      expect(audit.record).toHaveBeenCalled();
      expect(outbox.enqueue).toHaveBeenCalledWith(prisma, COMPANY_A, "insurance_claim.filed", expect.objectContaining({ claimId: "claim-1" }));
    });
  });

  describe("update()", () => {
    it("rejects when the claim does not belong to this company", async () => {
      prisma.insuranceClaim.findFirst.mockResolvedValue(null);

      await expect(service.update(COMPANY_A, ACTOR, "claim-1", { status: "approved" })).rejects.toThrow(NotFoundException);
      expect(prisma.insuranceClaim.update).not.toHaveBeenCalled();
    });

    it("audits and triggers a webhook only when the status actually changes", async () => {
      prisma.insuranceClaim.findFirst.mockResolvedValue({ id: "claim-1", companyId: COMPANY_A, status: "filed" });
      prisma.insuranceClaim.update.mockResolvedValue({ id: "claim-1", status: "under_review" });

      await service.update(COMPANY_A, ACTOR, "claim-1", { status: "under_review" });

      expect(audit.record).toHaveBeenCalledWith(
        COMPANY_A,
        ACTOR,
        "insurance_claim.status_changed",
        "InsuranceClaim",
        "claim-1",
        expect.stringContaining("under review"),
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(
        prisma,
        COMPANY_A,
        "insurance_claim.status_changed",
        expect.objectContaining({ status: "under_review" }),
      );
    });

    it("does not audit a status change when the new status equals the current one", async () => {
      prisma.insuranceClaim.findFirst.mockResolvedValue({ id: "claim-1", companyId: COMPANY_A, status: "filed" });
      prisma.insuranceClaim.update.mockResolvedValue({ id: "claim-1", status: "filed" });

      await service.update(COMPANY_A, ACTOR, "claim-1", { status: "filed" });

      expect(audit.record).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it("clears settledAt when explicitly set to null but leaves it untouched when omitted", async () => {
      prisma.insuranceClaim.findFirst.mockResolvedValue({ id: "claim-1", companyId: COMPANY_A, status: "settled" });
      prisma.insuranceClaim.update.mockResolvedValue({ id: "claim-1" });

      await service.update(COMPANY_A, ACTOR, "claim-1", { settledAt: null });
      expect(prisma.insuranceClaim.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ settledAt: null }) }));

      await service.update(COMPANY_A, ACTOR, "claim-1", { notes: "Follow-up call scheduled" });
      expect(prisma.insuranceClaim.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ settledAt: undefined }) }),
      );
    });
  });

  describe("exportCsv()", () => {
    it("includes claim and settlement columns in the export", async () => {
      prisma.insuranceClaim.findMany.mockResolvedValue([
        {
          dateFiled: new Date("2026-08-20T00:00:00.000Z"),
          claimType: "workers_comp",
          status: "settled",
          project: { name: "Site A" },
          insurerName: "Allianz",
          claimNumber: "CLM-42",
          policyNumber: "POL-9",
          claimAmount: "5000",
          settledAmount: "4500",
          description: "Fall from ladder",
        },
      ]);

      const csv = await service.exportCsv(COMPANY_A);

      expect(csv).toContain("Allianz");
      expect(csv).toContain("CLM-42");
      expect(csv).toContain("workers comp");
      expect(csv).toContain("4500");
    });
  });
});
