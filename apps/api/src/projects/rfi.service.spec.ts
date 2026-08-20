import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RfiService } from "./rfi.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Site Manager" };

describe("RfiService", () => {
  let service: RfiService;
  let prisma: {
    project: { findFirst: jest.Mock };
    rfi: { findFirst: jest.Mock; count: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let webhooks: { trigger: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      rfi: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };
    webhooks = { trigger: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        RfiService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: WebhooksService, useValue: webhooks },
      ],
    }).compile();

    service = module.get(RfiService);
  });

  describe("create()", () => {
    it("rejects when the project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, { projectId: "project-1", subject: "Door swing", question: "Which way does it open?" }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.rfi.create).not.toHaveBeenCalled();
    });

    it("numbers the RFI sequentially per project starting at RFI-001", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
      prisma.rfi.count.mockResolvedValue(4);
      prisma.rfi.create.mockResolvedValue({ id: "rfi-1", number: "RFI-005" });

      await service.create(COMPANY_A, ACTOR, { projectId: "project-1", subject: "Door swing", question: "Which way does it open?" });

      expect(prisma.rfi.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ number: "RFI-005" }) }),
      );
    });
  });

  describe("answer()", () => {
    it("rejects answering a closed RFI", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A, status: "closed", number: "RFI-001", subject: "Door swing" });

      await expect(service.answer(COMPANY_A, ACTOR, "rfi-1", { answer: "Inward" })).rejects.toThrow(BadRequestException);
      expect(prisma.rfi.update).not.toHaveBeenCalled();
    });

    it("triggers the rfi.answered webhook on success", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A, status: "open", number: "RFI-001", subject: "Door swing" });
      prisma.rfi.update.mockResolvedValue({ id: "rfi-1", status: "answered" });

      await service.answer(COMPANY_A, ACTOR, "rfi-1", { answer: "Inward" });

      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "rfi.answered", expect.objectContaining({ rfiId: "rfi-1", number: "RFI-001" }));
    });
  });

  describe("close()", () => {
    it("rejects closing an already-closed RFI", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A, status: "closed", number: "RFI-001", subject: "Door swing" });

      await expect(service.close(COMPANY_A, ACTOR, "rfi-1")).rejects.toThrow(BadRequestException);
      expect(prisma.rfi.update).not.toHaveBeenCalled();
    });

    it("closes an open RFI directly (withdrawn, no answer needed)", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A, status: "open", number: "RFI-001", subject: "Door swing" });
      prisma.rfi.update.mockResolvedValue({ id: "rfi-1", status: "closed" });

      await service.close(COMPANY_A, ACTOR, "rfi-1");

      expect(prisma.rfi.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "closed" }) }));
      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "rfi.closed", expect.objectContaining({ rfiId: "rfi-1" }));
    });
  });

  describe("reopen()", () => {
    it("rejects reopening an RFI that isn't closed", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1", companyId: COMPANY_A, status: "open", number: "RFI-001", subject: "Door swing" });

      await expect(service.reopen(COMPANY_A, ACTOR, "rfi-1")).rejects.toThrow(BadRequestException);
      expect(prisma.rfi.update).not.toHaveBeenCalled();
    });

    it("reopens to 'answered' when an answer already exists, not back to 'open'", async () => {
      prisma.rfi.findFirst.mockResolvedValue({
        id: "rfi-1",
        companyId: COMPANY_A,
        status: "closed",
        answer: "Inward",
        number: "RFI-001",
        subject: "Door swing",
      });
      prisma.rfi.update.mockResolvedValue({ id: "rfi-1", status: "answered" });

      await service.reopen(COMPANY_A, ACTOR, "rfi-1");

      expect(prisma.rfi.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "answered" }) }));
    });
  });

  describe("bulkClose()", () => {
    it("closes every open/answered RFI and reports failures for already-closed ones", async () => {
      const rfis: Record<string, { id: string; companyId: string; status: string; number: string; subject: string }> = {
        "rfi-1": { id: "rfi-1", companyId: COMPANY_A, status: "open", number: "RFI-001", subject: "Door swing" },
        "rfi-2": { id: "rfi-2", companyId: COMPANY_A, status: "closed", number: "RFI-002", subject: "Rebar spacing" },
      };
      prisma.rfi.findFirst.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(rfis[where.id] ?? null));
      prisma.rfi.update.mockResolvedValue({ id: "rfi-1", status: "closed" });

      const result = await service.bulkClose(COMPANY_A, ACTOR, ["rfi-1", "rfi-2"]);

      expect(result.succeeded).toBe(1);
      expect(result.failed).toEqual([{ id: "rfi-2", message: "RFI is already closed" }]);
      expect(prisma.rfi.update).toHaveBeenCalledTimes(1);
    });
  });
});
