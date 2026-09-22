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
    devicePushToken: { findMany: jest.Mock; deleteMany: jest.Mock };
  };
  let notifications: { list: jest.Mock };

  beforeEach(async () => {
    prisma = {
      membership: { findMany: jest.fn(), update: jest.fn() },
      pushSubscription: { findMany: jest.fn().mockResolvedValue([{ id: "sub-1", endpoint: "https://push/1", p256dh: "p", auth: "a" }]) },
      devicePushToken: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
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

describe("PushService — Cantero Field phones via Expo Push", () => {
  const TOKEN_1 = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
  const TOKEN_2 = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";
  let service: PushService;
  let prisma: any;
  let queue: { add: jest.Mock };
  let fetchMock: jest.Mock;
  const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

  beforeEach(async () => {
    prisma = {
      membership: {
        findMany: jest.fn().mockResolvedValue([{ id: "m1", companyId: "co", userId: "u1", pushNotificationsLastSentAt: null }]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "m1" }),
        update: jest.fn(),
      },
      pushSubscription: { findMany: jest.fn().mockResolvedValue([]) },
      devicePushToken: {
        findMany: jest.fn().mockResolvedValue([
          { id: "d1", token: TOKEN_1, platform: "ios" },
          { id: "d2", token: TOKEN_2, platform: "android" },
        ]),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    queue = { add: jest.fn() };
    const notifications = {
      list: jest.fn().mockResolvedValue({
        notifications: [notification("rfi-9", { link: "/projects/11111111-2222-3333-4444-555555555555", severity: "critical", title: "RFI overdue" })],
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: new ConfigService({ VAPID_SUBJECT: "mailto:t@c.dev", VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "k", EXPO_ACCESS_TOKEN: "expo-secret" }) },
        { provide: NotificationsService, useValue: notifications },
        { provide: getQueueToken(PUSH_CHECK_QUEUE), useValue: queue },
      ],
    }).compile();
    service = module.get(PushService);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("registers a phone's token, moving it to whoever signed in on that phone", async () => {
    await service.registerDevice("co", "u1", { token: TOKEN_1, platform: "ios" });
    expect(prisma.devicePushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: TOKEN_1 }, update: expect.objectContaining({ membershipId: "m1", platform: "ios" }) }),
    );
  });

  it("sends each alert to every phone through Expo, with what the app needs to open the right screen", async () => {
    fetchMock.mockResolvedValue(reply({ data: [{ status: "ok", id: "t1" }, { status: "ok", id: "t2" }] }));
    await service.checkAndNotifyAll();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", Authorization: "Bearer expo-secret" });
    const messages = JSON.parse(init.body);
    expect(messages).toEqual([
      expect.objectContaining({
        to: TOKEN_1,
        title: "RFI overdue",
        sound: "default",
        priority: "high",
        channelId: "alerts",
        data: { url: "/projects/11111111-2222-3333-4444-555555555555", type: "rfi_open", projectId: "11111111-2222-3333-4444-555555555555" },
      }),
      expect.objectContaining({ to: TOKEN_2 }),
    ]);
    // Receipts are checked later, not in the send path.
    expect(queue.add).toHaveBeenCalledWith("expo-receipts", { checks: [{ ticketId: "t1", tokenId: "d1" }, { ticketId: "t2", tokenId: "d2" }] }, expect.objectContaining({ delay: 15 * 60 * 1000 }));
  });

  it("drops a token Expo reports as no longer registered, right away or from its receipt", async () => {
    fetchMock.mockResolvedValue(reply({ data: [{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }, { status: "ok", id: "t2" }] }));
    await service.checkAndNotifyAll();
    expect(prisma.devicePushToken.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["d1"] } } });

    fetchMock.mockResolvedValue(reply({ data: { t2: { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } } } }));
    await expect(service.checkReceipts([{ ticketId: "t2", tokenId: "d2" }])).resolves.toEqual({ removed: 1 });
    expect(fetchMock.mock.calls.at(-1)![0]).toBe("https://exp.host/--/api/v2/push/getReceipts");
    expect(prisma.devicePushToken.deleteMany).toHaveBeenLastCalledWith({ where: { id: { in: ["d2"] } } });
  });

  it("an Expo outage is logged and doesn't stop the pass", async () => {
    fetchMock.mockResolvedValue(reply({ errors: [{ message: "Service unavailable" }] }, 503));
    await expect(service.checkAndNotifyAll()).resolves.toBeUndefined();
    expect(prisma.membership.update).toHaveBeenCalled();
    expect(prisma.devicePushToken.deleteMany).not.toHaveBeenCalled();
  });

  it("sends at most 100 messages per request", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `d${i}`, token: `ExponentPushToken[${String(i).padStart(22, "x")}]`, platform: "ios" }));
    prisma.devicePushToken.findMany.mockResolvedValue(many);
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => reply({ data: JSON.parse(String(init.body)).map((_: unknown, i: number) => ({ status: "ok", id: `t${i}` })) }));
    await service.checkAndNotifyAll();
    expect(fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).length)).toEqual([100, 50]);
  });
});
