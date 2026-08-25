import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { NotificationDigestService } from "./notification-digest.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { NotificationsService } from "./notifications.service";
import { NOTIFICATION_DIGEST_QUEUE } from "../common/queue/queue.module";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("NotificationDigestService", () => {
  let service: NotificationDigestService;
  let prisma: { membership: { findMany: jest.Mock; update: jest.Mock } };
  let mail: { send: jest.Mock };
  let notifications: { list: jest.Mock };

  const membershipBase = {
    id: "membership-1",
    companyId: "company-a",
    userId: "user-1",
    user: { email: "member@example.com", name: "Jane" },
    company: { name: "Acme" },
  };

  beforeEach(async () => {
    prisma = {
      membership: { findMany: jest.fn(), update: jest.fn() },
    };
    mail = { send: jest.fn() };
    notifications = { list: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        NotificationDigestService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: NotificationsService, useValue: notifications },
        { provide: getQueueToken(NOTIFICATION_DIGEST_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(NotificationDigestService);
  });

  it("skips a member whose interval hasn't elapsed yet", async () => {
    prisma.membership.findMany.mockResolvedValue([
      { ...membershipBase, emailDigestFrequency: "daily", emailDigestLastSentAt: new Date(Date.now() - 1000) },
    ]);

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(notifications.list).not.toHaveBeenCalled();
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });

  it("sends a digest and advances the cursor when new items exist past the daily interval", async () => {
    prisma.membership.findMany.mockResolvedValue([
      { ...membershipBase, emailDigestFrequency: "daily", emailDigestLastSentAt: new Date(Date.now() - DAY_MS - 1000) },
    ]);
    notifications.list.mockResolvedValue({
      notifications: [{ title: "RFI overdue", body: "RFI-001", link: "/projects/1", severity: "critical", occurredAt: new Date() }],
    });

    const result = await service.runDuePass();

    expect(result.sent).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].to).toBe("member@example.com");
    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: "membership-1" },
      data: { emailDigestLastSentAt: expect.any(Date) },
    });
  });

  it("advances the cursor without sending an email when nothing is new, so it doesn't get stuck re-checking every pass", async () => {
    prisma.membership.findMany.mockResolvedValue([
      { ...membershipBase, emailDigestFrequency: "weekly", emailDigestLastSentAt: new Date(Date.now() - 8 * DAY_MS) },
    ]);
    notifications.list.mockResolvedValue({ notifications: [] });

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: "membership-1" },
      data: { emailDigestLastSentAt: expect.any(Date) },
    });
  });

  it("treats a never-sent member as immediately due", async () => {
    prisma.membership.findMany.mockResolvedValue([{ ...membershipBase, emailDigestFrequency: "weekly", emailDigestLastSentAt: null }]);
    notifications.list.mockResolvedValue({
      notifications: [{ title: "New mention", body: "@Jane", link: "/tasks/1", severity: "warning", occurredAt: new Date() }],
    });

    const result = await service.runDuePass();

    expect(result.sent).toBe(1);
  });

  it("only counts notifications strictly newer than the last-sent cursor", async () => {
    const lastSent = new Date(Date.now() - 8 * DAY_MS);
    prisma.membership.findMany.mockResolvedValue([{ ...membershipBase, emailDigestFrequency: "weekly", emailDigestLastSentAt: lastSent }]);
    notifications.list.mockResolvedValue({
      notifications: [
        { title: "Old item", body: "stale", link: "/x", severity: "warning", occurredAt: new Date(lastSent.getTime() - 1000) },
      ],
    });

    const result = await service.runDuePass();

    expect(result.sent).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });
});
