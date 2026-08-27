import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import * as webpush from "web-push";
import { PushService } from "./push.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { NotificationsService } from "./notifications.service";
import { PUSH_CHECK_QUEUE } from "../common/queue/queue.module";

jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue(undefined),
}));

function notification(key: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    key,
    type: "rfi_open",
    severity: "warning",
    title: `Title ${key}`,
    body: `Body ${key}`,
    link: `/rfis/${key}`,
    occurredAt: new Date("2026-08-26T12:00:00.000Z"),
    ...overrides,
  };
}

describe("PushService.checkAndNotifyAll", () => {
  let service: PushService;
  let prisma: {
    membership: { findMany: jest.Mock; update: jest.Mock };
    pushSubscription: { findMany: jest.Mock; delete: jest.Mock };
  };
  let notifications: { list: jest.Mock };

  beforeEach(async () => {
    prisma = {
      membership: { findMany: jest.fn(), update: jest.fn() },
      pushSubscription: { findMany: jest.fn().mockResolvedValue([{ id: "sub-1", endpoint: "https://push/1", p256dh: "p", auth: "a" }]) },
    } as any;
    notifications = { list: jest.fn() };

    const config = new ConfigService({
      VAPID_SUBJECT: "mailto:test@cantero.dev",
      VAPID_PUBLIC_KEY: "pub",
      VAPID_PRIVATE_KEY: "priv",
    });

    const module = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: NotificationsService, useValue: notifications },
        { provide: getQueueToken(PUSH_CHECK_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(PushService);
    jest.clearAllMocks();
  });

  it("sends one tagged push per fresh item when the count is at or below the individual cap", async () => {
    prisma.membership.findMany.mockResolvedValue([{ id: "membership-1", companyId: "company-a", userId: "user-1", pushNotificationsLastSentAt: null }]);
    notifications.list.mockResolvedValue({ notifications: [notification("rfi-1"), notification("rfi-2")] });

    await service.checkAndNotifyAll();

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    const bodies = (webpush.sendNotification as jest.Mock).mock.calls.map((c) => JSON.parse(c[1]));
    expect(bodies.map((b) => b.tag)).toEqual(["rfi-1", "rfi-2"]);
    expect(bodies[0]).toMatchObject({ title: "Title rfi-1", type: "rfi_open", severity: "warning" });
  });

  it("collapses into a single summary push once fresh items exceed the individual cap", async () => {
    prisma.membership.findMany.mockResolvedValue([{ id: "membership-1", companyId: "company-a", userId: "user-1", pushNotificationsLastSentAt: null }]);
    notifications.list.mockResolvedValue({ notifications: Array.from({ length: 6 }, (_, i) => notification(`item-${i}`)) });

    await service.checkAndNotifyAll();

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const body = JSON.parse((webpush.sendNotification as jest.Mock).mock.calls[0][1]);
    expect(body.tag).toBe("summary");
    expect(body.title).toContain("6 new alerts");
  });

  it("skips a membership with nothing newer than its last-sent cursor", async () => {
    const lastSent = new Date("2026-08-26T13:00:00.000Z");
    prisma.membership.findMany.mockResolvedValue([{ id: "membership-1", companyId: "company-a", userId: "user-1", pushNotificationsLastSentAt: lastSent }]);
    notifications.list.mockResolvedValue({ notifications: [notification("old", { occurredAt: new Date("2026-08-26T12:00:00.000Z") })] });

    await service.checkAndNotifyAll();

    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });
});
