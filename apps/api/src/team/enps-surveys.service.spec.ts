import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EnpsSurveysService } from "./enps-surveys.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { SmsService } from "../common/sms/sms.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { ENPS_SURVEYS_QUEUE } from "../common/queue/queue.module";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Admin" };

describe("EnpsSurveysService", () => {
  let service: EnpsSurveysService;
  let prisma: {
    company: { findMany: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock };
    worker: { findMany: jest.Mock };
    enpsSurvey: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  };
  let sms: { send: jest.Mock };
  let webhooks: { trigger: jest.Mock };

  beforeEach(async () => {
    prisma = {
      company: { findMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
      worker: { findMany: jest.fn() },
      enpsSurvey: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };
    sms = { send: jest.fn() };
    webhooks = { trigger: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        EnpsSurveysService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: SmsService, useValue: sms },
        { provide: WebhooksService, useValue: webhooks },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: getQueueToken(ENPS_SURVEYS_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(EnpsSurveysService);
  });

  describe("sendNow() / sendWave()", () => {
    it("texts every active worker with a phone and advances lastEnpsSentAt", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, locale: "en" });
      prisma.worker.findMany.mockResolvedValue([
        { id: "w-1", phone: "+15551234567", preferredLocale: null },
        { id: "w-2", phone: "+15557654321", preferredLocale: "uk" },
      ]);
      prisma.enpsSurvey.create.mockResolvedValue({ id: "s-1" });

      const result = await service.sendNow(COMPANY_A, ACTOR);

      expect(result).toEqual({ sent: 2 });
      expect(prisma.enpsSurvey.create).toHaveBeenCalledTimes(2);
      expect(sms.send).toHaveBeenCalledTimes(2);
      expect(prisma.company.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: COMPANY_A }, data: expect.objectContaining({ lastEnpsSentAt: expect.any(Date) }) }),
      );
    });

    it("sends the invite in the worker's preferred locale over the company default", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, locale: "en" });
      prisma.worker.findMany.mockResolvedValue([{ id: "w-1", phone: "+15551234567", preferredLocale: "uk" }]);
      prisma.enpsSurvey.create.mockResolvedValue({ id: "s-1" });

      await service.sendNow(COMPANY_A, ACTOR);

      expect(sms.send).toHaveBeenCalledWith(expect.objectContaining({ to: "+15551234567", body: expect.stringContaining("анонімне") }));
    });

    it("still advances lastEnpsSentAt even when there are no eligible workers", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, locale: "en" });
      prisma.worker.findMany.mockResolvedValue([]);

      const result = await service.sendNow(COMPANY_A, ACTOR);

      expect(result).toEqual({ sent: 0 });
      expect(prisma.company.update).toHaveBeenCalled();
      expect(sms.send).not.toHaveBeenCalled();
    });
  });

  describe("runDuePass()", () => {
    it("only sends to companies whose wave is actually due", async () => {
      prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A }]);
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, locale: "en" });
      prisma.worker.findMany.mockResolvedValue([]);

      await service.runDuePass();

      const call = prisma.company.findMany.mock.calls[0][0];
      expect(call.where.enpsSurveysEnabled).toBe(true);
      expect(call.where.OR).toEqual(
        expect.arrayContaining([{ lastEnpsSentAt: null }, expect.objectContaining({ lastEnpsSentAt: expect.objectContaining({ lte: expect.any(Date) }) })]),
      );
    });
  });

  describe("submit()", () => {
    it("404s on an unknown token", async () => {
      prisma.enpsSurvey.findUnique.mockResolvedValue(null);
      await expect(service.submit("bad", { score: 8 })).rejects.toThrow(NotFoundException);
    });

    it("rejects a second submission", async () => {
      prisma.enpsSurvey.findUnique.mockResolvedValue({ id: "s-1", respondedAt: new Date() });
      await expect(service.submit("tok", { score: 8 })).rejects.toThrow(BadRequestException);
    });

    it("records the response and fires a webhook without leaking the workerId", async () => {
      prisma.enpsSurvey.findUnique.mockResolvedValue({ id: "s-1", respondedAt: null, companyId: COMPANY_A, workerId: "w-1" });
      prisma.enpsSurvey.update.mockResolvedValue({ id: "s-1", score: 9 });

      await service.submit("tok", { score: 9, comment: "Great team" });

      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "enps_survey.responded", { score: 9, comment: "Great team" });
      const webhookPayload = webhooks.trigger.mock.calls[0][2];
      expect(webhookPayload).not.toHaveProperty("workerId");
    });
  });

  describe("trend()", () => {
    it("computes the standard NPS formula with no per-worker identity in the result", async () => {
      prisma.enpsSurvey.findMany.mockResolvedValue([
        { score: 10, comment: "Love it", respondedAt: new Date() },
        { score: 3, comment: null, respondedAt: new Date() },
      ]);

      const result = await service.trend(COMPANY_A);

      expect(result.enpsScore).toBe(0);
      expect(result.comments).toEqual([{ comment: "Love it", score: 10, respondedAt: expect.any(Date) }]);
      expect(JSON.stringify(result)).not.toContain("workerId");
    });
  });
});
