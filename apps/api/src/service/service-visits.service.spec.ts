import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ServiceVisitsService } from "./service-visits.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("ServiceVisitsService", () => {
  let service: ServiceVisitsService;
  let prisma: {
    serviceContract: { findFirst: jest.Mock; update: jest.Mock };
    worker: { findFirst: jest.Mock };
    serviceVisit: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
  };
  let mail: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      serviceContract: { findFirst: jest.fn(), update: jest.fn() },
      worker: { findFirst: jest.fn() },
      serviceVisit: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    };
    mail = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ServiceVisitsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue("http://localhost:3000") } },
      ],
    }).compile();

    service = module.get(ServiceVisitsService);
  });

  describe("schedule", () => {
    it("throws when the contract doesn't belong to this company", async () => {
      prisma.serviceContract.findFirst.mockResolvedValue(null);

      await expect(
        service.schedule(COMPANY_A, ACTOR, "contract-1", { scheduledDate: "2026-06-01T00:00:00.000Z" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a technician from another company", async () => {
      prisma.serviceContract.findFirst.mockResolvedValue({ id: "contract-1", title: "HVAC", frequencyMonths: 3 });
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.schedule(COMPANY_A, ACTOR, "contract-1", {
          scheduledDate: "2026-06-01T00:00:00.000Z",
          technicianWorkerId: "worker-1",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates the visit and advances nextVisitDate by the contract's cadence", async () => {
      prisma.serviceContract.findFirst.mockResolvedValue({ id: "contract-1", title: "HVAC", frequencyMonths: 3 });
      prisma.serviceVisit.create.mockResolvedValue({ id: "visit-1" });

      await service.schedule(COMPANY_A, ACTOR, "contract-1", { scheduledDate: "2026-06-01T00:00:00.000Z" });

      expect(prisma.serviceContract.update).toHaveBeenCalledWith({
        where: { id: "contract-1" },
        data: { nextVisitDate: new Date("2026-09-01T00:00:00.000Z") },
      });
    });
  });

  describe("complete", () => {
    it("throws when the visit doesn't exist in this company", async () => {
      prisma.serviceVisit.findFirst.mockResolvedValue(null);
      await expect(service.complete(COMPANY_A, ACTOR, "visit-1", {})).rejects.toThrow(NotFoundException);
    });

    it("emails a feedback link to the client when the client has an email", async () => {
      prisma.serviceVisit.findFirst.mockResolvedValue({
        id: "visit-1",
        notes: null,
        feedbackToken: "tok123",
        serviceContract: { title: "HVAC", client: { name: "Acme", email: "client@acme.com" } },
      });
      prisma.serviceVisit.update.mockResolvedValue({ id: "visit-1", completedAt: new Date() });

      await service.complete(COMPANY_A, ACTOR, "visit-1", {});

      expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "client@acme.com" }));
    });

    it("skips the feedback email when the client has no email on file", async () => {
      prisma.serviceVisit.findFirst.mockResolvedValue({
        id: "visit-1",
        notes: null,
        feedbackToken: "tok123",
        serviceContract: { title: "HVAC", client: { name: "Acme", email: null } },
      });
      prisma.serviceVisit.update.mockResolvedValue({ id: "visit-1", completedAt: new Date() });

      await service.complete(COMPANY_A, ACTOR, "visit-1", {});

      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe("submitFeedback", () => {
    it("throws on an unknown token", async () => {
      prisma.serviceVisit.findUnique.mockResolvedValue(null);
      await expect(service.submitFeedback("bad-token", { rating: 5 })).rejects.toThrow(NotFoundException);
    });

    it("refuses feedback on a visit that hasn't been completed", async () => {
      prisma.serviceVisit.findUnique.mockResolvedValue({ id: "visit-1", completedAt: null, satisfactionRating: null });
      await expect(service.submitFeedback("tok123", { rating: 5 })).rejects.toThrow(BadRequestException);
    });

    it("refuses to overwrite feedback already submitted", async () => {
      prisma.serviceVisit.findUnique.mockResolvedValue({ id: "visit-1", completedAt: new Date(), satisfactionRating: 4 });
      await expect(service.submitFeedback("tok123", { rating: 5 })).rejects.toThrow(BadRequestException);
    });

    it("records rating and comment on a valid, completed, unrated visit", async () => {
      prisma.serviceVisit.findUnique.mockResolvedValue({ id: "visit-1", completedAt: new Date(), satisfactionRating: null });
      prisma.serviceVisit.update.mockResolvedValue({ id: "visit-1", satisfactionRating: 5 });

      await service.submitFeedback("tok123", { rating: 5, comment: "Great job" });

      expect(prisma.serviceVisit.update).toHaveBeenCalledWith({
        where: { id: "visit-1" },
        data: { satisfactionRating: 5, satisfactionComment: "Great job" },
      });
    });
  });
});
