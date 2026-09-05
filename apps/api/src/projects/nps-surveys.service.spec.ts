import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { NpsSurveysService } from "./nps-surveys.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { MessageTemplatesService } from "../message-templates/message-templates.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("NpsSurveysService", () => {
  let service: NpsSurveysService;
  let prisma: {
    project: { findFirst: jest.Mock };
    npsSurvey: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    task: { aggregate: jest.Mock; create: jest.Mock };
    membership: { findMany: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let webhooks: { trigger: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      npsSurvey: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
      task: { aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }), create: jest.fn() },
      membership: { findMany: jest.fn().mockResolvedValue([{ user: { email: "owner@example.com" } }]) },
    };
    mail = { send: jest.fn() };
    webhooks = { trigger: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        NpsSurveysService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: MailService, useValue: mail },
        { provide: WebhooksService, useValue: webhooks },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: MessageTemplatesService, useValue: { render: jest.fn().mockResolvedValue(null) } },
      ],
    }).compile();

    service = module.get(NpsSurveysService);
  });

  describe("send()", () => {
    it("rejects a project whose client has no email on file", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "proj-1", name: "Site A", client: { name: "Client", email: null } });

      await expect(service.send(COMPANY_A, ACTOR, "proj-1")).rejects.toThrow(BadRequestException);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it("rejects sending a second survey for the same project", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "proj-1", name: "Site A", client: { name: "Client", email: "c@x.com" } });
      prisma.npsSurvey.findFirst.mockResolvedValue({ id: "existing-survey" });

      await expect(service.send(COMPANY_A, ACTOR, "proj-1")).rejects.toThrow(BadRequestException);
    });

    it("emails the client and creates the survey when everything checks out", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "proj-1", name: "Site A", client: { name: "Client", email: "c@x.com" } });
      prisma.npsSurvey.findFirst.mockResolvedValue(null);
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, name: "Acme Co" });
      prisma.npsSurvey.create.mockResolvedValue({ id: "survey-1", token: "abc" });

      const result = await service.send(COMPANY_A, ACTOR, "proj-1");

      expect(prisma.npsSurvey.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: COMPANY_A, projectId: "proj-1" }) }),
      );
      expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "c@x.com" }));
      expect(result).toEqual({ id: "survey-1", token: "abc" });
    });
  });

  describe("submit()", () => {
    it("404s on an unknown token", async () => {
      prisma.npsSurvey.findUnique.mockResolvedValue(null);
      await expect(service.submit("bad-token", { score: 8 })).rejects.toThrow(NotFoundException);
    });

    it("rejects a second submission for the same survey", async () => {
      prisma.npsSurvey.findUnique.mockResolvedValue({ id: "s-1", respondedAt: new Date(), companyId: COMPANY_A, projectId: "proj-1" });
      await expect(service.submit("tok", { score: 8 })).rejects.toThrow(BadRequestException);
    });

    it("records the score, comment, and fires a webhook", async () => {
      prisma.npsSurvey.findUnique.mockResolvedValue({
        id: "s-1",
        respondedAt: null,
        companyId: COMPANY_A,
        projectId: "proj-1",
        project: { name: "Site A" },
      });
      prisma.npsSurvey.update.mockResolvedValue({ id: "s-1", score: 9 });

      await service.submit("tok", { score: 9, comment: "Great work" });

      expect(prisma.npsSurvey.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ score: 9, comment: "Great work" }) }),
      );
      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "nps_survey.responded", expect.objectContaining({ score: 9 }));
    });

    it("does nothing extra for a detractor score when npsDetractorFollowUpEnabled is off", async () => {
      prisma.npsSurvey.findUnique.mockResolvedValue({
        id: "s-1",
        respondedAt: null,
        companyId: COMPANY_A,
        projectId: "proj-1",
        project: { id: "proj-1", name: "Site A", client: { name: "Acme Client" } },
      });
      prisma.npsSurvey.update.mockResolvedValue({ id: "s-1", score: 3 });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ npsDetractorFollowUpEnabled: false, name: "Acme Co" });

      await service.submit("tok", { score: 3, comment: "Too slow" });

      expect(prisma.task.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it("creates a follow-up task and emails owners for a detractor score when enabled", async () => {
      prisma.npsSurvey.findUnique.mockResolvedValue({
        id: "s-1",
        respondedAt: null,
        companyId: COMPANY_A,
        projectId: "proj-1",
        project: { id: "proj-1", name: "Site A", client: { name: "Acme Client" } },
      });
      prisma.npsSurvey.update.mockResolvedValue({ id: "s-1", score: 3 });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ npsDetractorFollowUpEnabled: true, name: "Acme Co" });

      await service.submit("tok", { score: 3, comment: "Too slow" });

      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ projectId: "proj-1", name: expect.stringContaining("3/10") }) }),
      );
      expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@example.com" }));
    });

    it("does not create a follow-up for a passive/promoter score even when enabled", async () => {
      prisma.npsSurvey.findUnique.mockResolvedValue({
        id: "s-1",
        respondedAt: null,
        companyId: COMPANY_A,
        projectId: "proj-1",
        project: { id: "proj-1", name: "Site A", client: null },
      });
      prisma.npsSurvey.update.mockResolvedValue({ id: "s-1", score: 8 });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ npsDetractorFollowUpEnabled: true, name: "Acme Co" });

      await service.submit("tok", { score: 8 });

      expect(prisma.task.create).not.toHaveBeenCalled();
    });
  });

  describe("trend()", () => {
    it("returns nulls when there are no responses yet", async () => {
      prisma.npsSurvey.findMany.mockResolvedValue([]);
      const result = await service.trend(COMPANY_A);
      expect(result).toEqual({
        npsScore: null,
        averageScore: null,
        totalResponses: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        responses: [],
      });
    });

    it("computes the standard NPS formula (%promoters - %detractors)", async () => {
      prisma.npsSurvey.findMany.mockResolvedValue([
        { score: 10, comment: null, respondedAt: new Date(), projectId: "p1", project: { name: "A" } },
        { score: 9, comment: null, respondedAt: new Date(), projectId: "p2", project: { name: "B" } },
        { score: 7, comment: null, respondedAt: new Date(), projectId: "p3", project: { name: "C" } },
        { score: 3, comment: null, respondedAt: new Date(), projectId: "p4", project: { name: "D" } },
      ]);

      const result = await service.trend(COMPANY_A);

      // 2 promoters, 1 passive, 1 detractor out of 4 → (2-1)/4 * 100 = 25
      expect(result.npsScore).toBe(25);
      expect(result.promoters).toBe(2);
      expect(result.passives).toBe(1);
      expect(result.detractors).toBe(1);
      expect(result.averageScore).toBe(7.3);
    });
  });
});
