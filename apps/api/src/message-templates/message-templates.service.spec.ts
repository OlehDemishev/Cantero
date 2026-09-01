import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { MessageTemplatesService } from "./message-templates.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Admin" };

describe("MessageTemplatesService", () => {
  let service: MessageTemplatesService;
  let prisma: {
    messageTemplate: { findMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      messageTemplate: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        MessageTemplatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(MessageTemplatesService);
  });

  describe("list()", () => {
    it("returns every known key, with null customBody where nothing is overridden", async () => {
      prisma.messageTemplate.findMany.mockResolvedValue([]);

      const result = await service.list(COMPANY_A);

      expect(result.map((r) => r.key)).toEqual([
        "task_assigned_sms",
        "safety_briefing_sms",
        "review_request_email",
        "nps_survey_email",
      ]);
      expect(result.every((r) => r.customBody === null)).toBe(true);
    });

    it("merges in an existing override", async () => {
      prisma.messageTemplate.findMany.mockResolvedValue([
        { key: "task_assigned_sms", body: "Custom: {{taskName}}", updatedByName: "Admin", updatedAt: new Date("2026-01-01") },
      ]);

      const result = await service.list(COMPANY_A);
      const taskEntry = result.find((r) => r.key === "task_assigned_sms")!;

      expect(taskEntry.customBody).toBe("Custom: {{taskName}}");
      expect(taskEntry.updatedByName).toBe("Admin");
    });
  });

  describe("upsert()", () => {
    it("rejects a body with an unknown placeholder", async () => {
      await expect(service.upsert(COMPANY_A, ACTOR, "task_assigned_sms", "Hi {{secretCode}}")).rejects.toThrow(BadRequestException);
      expect(prisma.messageTemplate.upsert).not.toHaveBeenCalled();
    });

    it("accepts a body using only allowed placeholders", async () => {
      prisma.messageTemplate.upsert.mockResolvedValue({ id: "mt-1" });

      await service.upsert(COMPANY_A, ACTOR, "task_assigned_sms", "New task: {{taskName}} at {{projectName}}");

      expect(prisma.messageTemplate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId_key: { companyId: COMPANY_A, key: "task_assigned_sms" } },
        }),
      );
    });
  });

  describe("render()", () => {
    it("returns null when the company has no override for this key", async () => {
      prisma.messageTemplate.findUnique.mockResolvedValue(null);

      const result = await service.render(COMPANY_A, "task_assigned_sms", { taskName: "Pour slab", projectName: "Site A" });

      expect(result).toBeNull();
    });

    it("substitutes placeholders in the company's override", async () => {
      prisma.messageTemplate.findUnique.mockResolvedValue({ body: "Job: {{taskName}} @ {{projectName}}" });

      const result = await service.render(COMPANY_A, "task_assigned_sms", { taskName: "Pour slab", projectName: "Site A" });

      expect(result).toBe("Job: Pour slab @ Site A");
    });
  });
});
