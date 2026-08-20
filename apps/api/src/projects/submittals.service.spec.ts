import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SubmittalsService } from "./submittals.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("SubmittalsService", () => {
  let service: SubmittalsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    submittal: { findFirst: jest.Mock; count: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let webhooks: { trigger: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      submittal: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };
    webhooks = { trigger: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SubmittalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: WebhooksService, useValue: webhooks },
      ],
    }).compile();

    service = module.get(SubmittalsService);
  });

  describe("create()", () => {
    it("rejects when the project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.create(COMPANY_A, ACTOR, { projectId: "project-1", title: "Tile submittal" })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.submittal.create).not.toHaveBeenCalled();
    });

    it("numbers root submittals sequentially, ignoring revisions", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
      prisma.submittal.count.mockResolvedValue(2);
      prisma.submittal.create.mockResolvedValue({ id: "submittal-1", number: "SUB-003" });

      await service.create(COMPANY_A, ACTOR, { projectId: "project-1", title: "Tile submittal" });

      expect(prisma.submittal.count).toHaveBeenCalledWith({ where: { projectId: "project-1", rootSubmittalId: null } });
      expect(prisma.submittal.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ number: "SUB-003" }) }));
    });
  });

  describe("submit()", () => {
    it("rejects submitting a non-draft item", async () => {
      prisma.submittal.findFirst.mockResolvedValue({ id: "s-1", companyId: COMPANY_A, status: "submitted", number: "SUB-001", revision: 0 });

      await expect(service.submit(COMPANY_A, ACTOR, "s-1")).rejects.toThrow(BadRequestException);
      expect(prisma.submittal.update).not.toHaveBeenCalled();
    });
  });

  describe("review()", () => {
    it("rejects reviewing an item that isn't submitted", async () => {
      prisma.submittal.findFirst.mockResolvedValue({ id: "s-1", companyId: COMPANY_A, status: "draft", number: "SUB-001", revision: 0 });

      await expect(service.review(COMPANY_A, ACTOR, "s-1", { decision: "approved" })).rejects.toThrow(BadRequestException);
      expect(prisma.submittal.update).not.toHaveBeenCalled();
    });

    it("maps both approval decisions to the same submittal.approved webhook event", async () => {
      prisma.submittal.findFirst.mockResolvedValue({ id: "s-1", companyId: COMPANY_A, status: "submitted", number: "SUB-001", revision: 0 });
      prisma.submittal.update.mockResolvedValue({ id: "s-1", status: "approved_as_noted" });

      await service.review(COMPANY_A, ACTOR, "s-1", { decision: "approved_as_noted" });

      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "submittal.approved", expect.objectContaining({ submittalId: "s-1" }));
    });

    it("maps a revise-and-resubmit decision to submittal.revise_requested", async () => {
      prisma.submittal.findFirst.mockResolvedValue({ id: "s-1", companyId: COMPANY_A, status: "submitted", number: "SUB-001", revision: 0 });
      prisma.submittal.update.mockResolvedValue({ id: "s-1", status: "revise_and_resubmit" });

      await service.review(COMPANY_A, ACTOR, "s-1", { decision: "revise_and_resubmit" });

      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "submittal.revise_requested", expect.objectContaining({ submittalId: "s-1" }));
    });
  });

  describe("revise()", () => {
    it("rejects revising an item that wasn't rejected or flagged for resubmission", async () => {
      prisma.submittal.findFirst.mockResolvedValue({ id: "s-1", companyId: COMPANY_A, status: "approved", number: "SUB-001", revision: 0 });

      await expect(service.revise(COMPANY_A, ACTOR, "s-1")).rejects.toThrow(BadRequestException);
      expect(prisma.submittal.create).not.toHaveBeenCalled();
    });

    it("creates the next revision chained to the root, keeping the same number", async () => {
      prisma.submittal.findFirst.mockResolvedValue({
        id: "s-1",
        companyId: COMPANY_A,
        status: "revise_and_resubmit",
        number: "SUB-001",
        revision: 0,
        rootSubmittalId: null,
        projectId: "project-1",
        title: "Tile submittal",
        specSection: null,
        dueDate: null,
      });
      prisma.submittal.create.mockResolvedValue({ id: "s-2", number: "SUB-001", revision: 1 });

      await service.revise(COMPANY_A, ACTOR, "s-1");

      expect(prisma.submittal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ number: "SUB-001", revision: 1, rootSubmittalId: "s-1" }),
        }),
      );
    });
  });

  describe("bulkApprove()", () => {
    it("approves every submitted item and reports failures for items that aren't submitted", async () => {
      const submittals: Record<string, { id: string; companyId: string; status: string; number: string; revision: number }> = {
        "s-1": { id: "s-1", companyId: COMPANY_A, status: "submitted", number: "SUB-001", revision: 0 },
        "s-2": { id: "s-2", companyId: COMPANY_A, status: "draft", number: "SUB-002", revision: 0 },
      };
      prisma.submittal.findFirst.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(submittals[where.id] ?? null));
      prisma.submittal.update.mockResolvedValue({ id: "s-1", status: "approved" });

      const result = await service.bulkApprove(COMPANY_A, ACTOR, ["s-1", "s-2"]);

      expect(result.succeeded).toBe(1);
      expect(result.failed).toEqual([{ id: "s-2", message: "Only a submitted item can be reviewed" }]);
      expect(prisma.submittal.update).toHaveBeenCalledTimes(1);
    });
  });
});
