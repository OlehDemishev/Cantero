import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { LeadFollowUpService } from "./lead-follow-up.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { LEAD_FOLLOW_UP_QUEUE } from "../common/queue/queue.module";

const COMPANY_A = "company-a";
const DAY_MS = 24 * 60 * 60 * 1000;

function leadCreatedDaysAgo(days: number, overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    name: "Jane Prospect",
    email: "jane@example.com",
    createdAt: new Date(Date.now() - days * DAY_MS),
    leadFollowUpCount: 0,
    ...overrides,
  };
}

describe("LeadFollowUpService", () => {
  let service: LeadFollowUpService;
  let prisma: {
    company: { findMany: jest.Mock };
    client: { findMany: jest.Mock; update: jest.Mock };
  };
  let mail: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      company: { findMany: jest.fn() },
      client: { findMany: jest.fn(), update: jest.fn() },
    };
    mail = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        LeadFollowUpService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: getQueueToken(LEAD_FOLLOW_UP_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(LeadFollowUpService);
  });

  it("skips companies with lead follow-up disabled", async () => {
    prisma.company.findMany.mockResolvedValue([]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });

  it("does not send before the next threshold is reached", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.client.findMany.mockResolvedValue([leadCreatedDaysAgo(0)]); // first threshold is 1 day

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it("sends the first follow-up once 1+ day old and advances leadFollowUpCount", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.client.findMany.mockResolvedValue([leadCreatedDaysAgo(1)]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].to).toBe("jane@example.com");
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { leadFollowUpCount: 1, lastLeadFollowUpSentAt: expect.any(Date) },
    });
  });

  it("escalates tone on the final (3rd) follow-up past 7 days", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.client.findMany.mockResolvedValue([leadCreatedDaysAgo(8, { leadFollowUpCount: 2 })]);

    await service.runDuePass();

    expect(mail.send.mock.calls[0][0].subject).toContain("Last check-in");
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { leadFollowUpCount: 3, lastLeadFollowUpSentAt: expect.any(Date) },
    });
  });

  it("skips a lead with no email rather than crashing the pass", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.client.findMany.mockResolvedValue([leadCreatedDaysAgo(2, { email: null })]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("excludes a lead that already received all 3 follow-ups, via the query filter", async () => {
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_A, name: "Acme" }]);
    prisma.client.findMany.mockResolvedValue([]);

    await service.runDuePass();

    const queryArg = prisma.client.findMany.mock.calls[0][0];
    expect(queryArg.where.leadFollowUpCount).toEqual({ lt: 3 });
    expect(queryArg.where.stage).toBe("lead");
  });
});
