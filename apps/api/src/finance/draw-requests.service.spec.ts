import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DrawRequestsService } from "./draw-requests.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { AiaBillingService } from "./aia-billing.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Office Manager" };
const projectAccessStub = { assertAccess: jest.fn(), filterAccessible: jest.fn(async (rows: unknown[]) => rows) };

describe("DrawRequestsService", () => {
  let service: DrawRequestsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    invoice: { findFirst: jest.Mock; findMany: jest.Mock };
    drawRequest: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    lienWaiver: { findMany: jest.Mock };
    document: { findMany: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let aiaBilling: { generatePdf: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      invoice: { findFirst: jest.fn(), findMany: jest.fn() },
      drawRequest: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      lienWaiver: { findMany: jest.fn() },
      document: { findMany: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
    };
    audit = { record: jest.fn() };
    aiaBilling = { generatePdf: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        DrawRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { render: jest.fn().mockResolvedValue(Buffer.from("pdf")) } },
        { provide: StorageService, useValue: { read: jest.fn().mockResolvedValue(Buffer.from("file")) } },
        { provide: AuditService, useValue: audit },
        { provide: AiaBillingService, useValue: aiaBilling },
        { provide: ProjectAccessService, useValue: projectAccessStub },
      ],
    }).compile();

    service = module.get(DrawRequestsService);
  });

  describe("create()", () => {
    it("rejects when the project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          invoiceId: "invoice-1",
          periodStart: "2026-08-01T00:00:00.000Z",
          periodEnd: "2026-08-31T00:00:00.000Z",
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.drawRequest.create).not.toHaveBeenCalled();
    });

    it("rejects an invoice that isn't a progress-billing draw", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Site A" });
      prisma.invoice.findFirst.mockResolvedValue({ id: "invoice-1", percentComplete: null });

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          invoiceId: "invoice-1",
          periodStart: "2026-08-01T00:00:00.000Z",
          periodEnd: "2026-08-31T00:00:00.000Z",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.drawRequest.create).not.toHaveBeenCalled();
    });

    it("rejects an invoice that already has a draw request", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Site A" });
      prisma.invoice.findFirst.mockResolvedValue({ id: "invoice-1", percentComplete: 30 });
      prisma.drawRequest.findUnique.mockResolvedValue({ id: "existing-draw" });

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          invoiceId: "invoice-1",
          periodStart: "2026-08-01T00:00:00.000Z",
          periodEnd: "2026-08-31T00:00:00.000Z",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.drawRequest.create).not.toHaveBeenCalled();
    });

    it("numbers the next draw sequentially per project", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Site A" });
      prisma.invoice.findFirst.mockResolvedValue({ id: "invoice-2", percentComplete: 60 });
      prisma.drawRequest.findUnique.mockResolvedValue(null);
      prisma.drawRequest.findFirst.mockResolvedValue({ drawNumber: 3 });
      prisma.drawRequest.create.mockResolvedValue({ id: "draw-4", drawNumber: 4 });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        invoiceId: "invoice-2",
        periodStart: "2026-08-01T00:00:00.000Z",
        periodEnd: "2026-08-31T00:00:00.000Z",
      });

      expect(prisma.drawRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ drawNumber: 4 }) }));
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("updateStatus()", () => {
    it("stamps fundedAt when a draw is marked funded", async () => {
      prisma.drawRequest.findFirst.mockResolvedValue({ id: "draw-1", drawNumber: 1, companyId: COMPANY_A });
      prisma.drawRequest.update.mockResolvedValue({ id: "draw-1", status: "funded" });

      await service.updateStatus(COMPANY_A, ACTOR, "draw-1", "funded");

      expect(prisma.drawRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "funded", fundedAt: expect.any(Date) }) }),
      );
    });

    it("does not stamp any timestamp when reverting to draft", async () => {
      prisma.drawRequest.findFirst.mockResolvedValue({ id: "draw-1", drawNumber: 1, companyId: COMPANY_A });
      prisma.drawRequest.update.mockResolvedValue({ id: "draw-1", status: "draft" });

      await service.updateStatus(COMPANY_A, ACTOR, "draw-1", "draft");

      const call = prisma.drawRequest.update.mock.calls[0][0];
      expect(call.data).toEqual({ status: "draft" });
    });
  });

  describe("buildPackage()", () => {
    it("only includes signed lien waivers incurred within the draw's period", async () => {
      prisma.drawRequest.findFirst.mockResolvedValue({
        id: "draw-1",
        drawNumber: 1,
        projectId: "project-1",
        invoiceId: "invoice-1",
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        periodEnd: new Date("2026-08-31T00:00:00.000Z"),
        status: "submitted",
        lenderName: null,
        lenderContactEmail: null,
        notes: null,
        invoice: { number: "INV-0001", total: 1000, percentComplete: 30, retainageAmount: 50, project: { name: "Site A" }, client: { name: "Acme" } },
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Co", currency: "EUR", logoStorageKey: null, brandColor: null });
      prisma.lienWaiver.findMany.mockResolvedValue([]);
      prisma.document.findMany.mockResolvedValue([]);
      aiaBilling.generatePdf.mockResolvedValue(Buffer.from("sov"));

      await service.buildPackage(COMPANY_A, "draw-1");

      const call = prisma.lienWaiver.findMany.mock.calls[0][0];
      expect(call.where.signedAt).toEqual({ not: null });
      expect(call.where.subcontractorCost.incurredDate).toEqual({
        gte: new Date("2026-08-01T00:00:00.000Z"),
        lte: new Date("2026-08-31T00:00:00.000Z"),
      });
    });

    it("rejects a draw request that does not belong to this company", async () => {
      prisma.drawRequest.findFirst.mockResolvedValue(null);

      await expect(service.buildPackage(COMPANY_A, "draw-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("project access", () => {
    it("get() checks project access for the draw's own project", async () => {
      prisma.drawRequest.findFirst.mockResolvedValue({ id: "draw-1", projectId: "project-1", companyId: COMPANY_A });

      await service.get(COMPANY_A, "draw-1", "user-2", "worker");

      expect(projectAccessStub.assertAccess).toHaveBeenCalledWith(COMPANY_A, "project-1", "user-2", "worker");
    });

    it("buildPackage() also checks project access before assembling the ZIP", async () => {
      prisma.drawRequest.findFirst.mockResolvedValue({
        id: "draw-1",
        projectId: "project-1",
        companyId: COMPANY_A,
        invoice: { project: { name: "P" }, client: { name: "C" } },
      });
      projectAccessStub.assertAccess.mockRejectedValueOnce(new Error("no access"));

      await expect(service.buildPackage(COMPANY_A, "draw-1", "user-2", "worker")).rejects.toThrow("no access");
      expect(prisma.company.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });
});
