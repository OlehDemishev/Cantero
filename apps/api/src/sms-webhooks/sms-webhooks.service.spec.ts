import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getExpectedTwilioSignature } from "twilio";
import { SmsWebhooksService } from "./sms-webhooks.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { TasksService } from "../projects/tasks.service";

describe("SmsWebhooksService", () => {
  let service: SmsWebhooksService;
  let prisma: {
    worker: { findFirst: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    resourceAssignment: { findFirst: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let tasks: { update: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      worker: { findFirst: jest.fn() },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "company-a", locale: "en" }) },
      resourceAssignment: { findFirst: jest.fn() },
    };
    audit = { record: jest.fn() };
    tasks = { update: jest.fn() };
    config = { get: jest.fn().mockReturnValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        SmsWebhooksService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: TasksService, useValue: tasks },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(SmsWebhooksService);
  });

  describe("validateSignature()", () => {
    it("fails closed when TWILIO_AUTH_TOKEN isn't configured, rather than accepting every unverifiable request", () => {
      config.get.mockReturnValue(undefined);
      expect(service.validateSignature("some-signature", "https://example.com/webhooks/sms/inbound", {})).toBe(false);
      expect(service.validateSignature(undefined, "https://example.com/webhooks/sms/inbound", {})).toBe(false);
    });

    it("rejects a missing signature header when a token is configured", () => {
      config.get.mockReturnValue("test-auth-token");
      expect(service.validateSignature(undefined, "https://example.com/webhooks/sms/inbound", {})).toBe(false);
    });

    it("accepts a signature that correctly HMACs the URL and params under the configured token", () => {
      const authToken = "test-auth-token";
      config.get.mockReturnValue(authToken);
      const url = "https://example.com/webhooks/sms/inbound";
      const params = { From: "+15550000000", Body: "done" };
      const validSignature = getExpectedTwilioSignature(authToken, url, params);

      expect(service.validateSignature(validSignature, url, params)).toBe(true);
    });

    it("rejects a signature computed under the wrong token", () => {
      config.get.mockReturnValue("test-auth-token");
      const url = "https://example.com/webhooks/sms/inbound";
      const params = { From: "+15550000000", Body: "done" };
      const wrongSignature = getExpectedTwilioSignature("a-different-token", url, params);

      expect(service.validateSignature(wrongSignature, url, params)).toBe(false);
    });
  });

  describe("handleInbound()", () => {
    it("silently ignores an SMS from a number that doesn't match any active worker", async () => {
      prisma.worker.findFirst.mockResolvedValue(null);

      const twiml = await service.handleInbound("+15550000000", "done");

      expect(twiml).toContain("<Response>");
      expect(twiml).not.toContain("<Message>");
      expect(tasks.update).not.toHaveBeenCalled();
    });

    it("replies with a hint when the message doesn't match any recognized keyword", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", companyId: "company-a", preferredLocale: null });

      const twiml = await service.handleInbound("+15550000001", "running late, traffic");

      expect(twiml).toContain("Reply");
      expect(tasks.update).not.toHaveBeenCalled();
    });

    it("replies with a no-task message when the worker has no task assignment", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", companyId: "company-a", preferredLocale: null });
      prisma.resourceAssignment.findFirst.mockResolvedValue(null);

      const twiml = await service.handleInbound("+15550000001", "done");

      expect(twiml).toContain("No current task found");
      expect(tasks.update).not.toHaveBeenCalled();
    });

    it("updates the worker's most recently assigned task and confirms by SMS", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", companyId: "company-a", name: "Jane Doe", preferredLocale: null });
      prisma.resourceAssignment.findFirst.mockResolvedValue({ task: { id: "task-1", name: "Pour footings" } });

      const twiml = await service.handleInbound("+15550000001", "done");

      expect(tasks.update).toHaveBeenCalledWith("company-a", "task-1", { status: "done" });
      expect(audit.record).toHaveBeenCalledWith(
        "company-a",
        { name: "Jane Doe (SMS)" },
        "task.status_updated_via_sms",
        "Task",
        "task-1",
        expect.stringContaining("done"),
      );
      expect(twiml).toContain("Pour footings");
      expect(twiml).toContain("marked done");
    });

    it("looks up the worker by trimmed phone number and only among active workers", async () => {
      prisma.worker.findFirst.mockResolvedValue(null);

      await service.handleInbound("  +15550000001  ", "done");

      expect(prisma.worker.findFirst).toHaveBeenCalledWith({ where: { phone: "+15550000001", active: true } });
    });
  });
});
