import { ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { AuthUser } from "@cantero/shared";
import { TimeEntriesController } from "./time-entries.controller";
import type { TimeEntriesService } from "./time-entries.service";
import type { SelfScopeService } from "../common/permissions/self-scope.service";
import { signKioskToken } from "./kiosk-token";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const kioskUser = { userId: "kiosk-user", companyId: "company-a", role: "MEMBER" } as unknown as AuthUser;

describe("TimeEntriesController kiosk clock-in", () => {
  const jwt = new JwtService({ secret: "test-secret" });
  let service: { create: jest.Mock };
  let selfScope: { assertOwnWorker: jest.Mock };
  let controller: TimeEntriesController;

  beforeEach(() => {
    service = { create: jest.fn().mockResolvedValue({ id: "entry-1" }) };
    selfScope = { assertOwnWorker: jest.fn() };
    controller = new TimeEntriesController(service as unknown as TimeEntriesService, selfScope as unknown as SelfScopeService, jwt);
  });

  const entry = { projectId: PROJECT, hours: 8, date: "2026-10-23T08:00:00.000Z" };

  it("logs the hours for the worker the kiosk token names", async () => {
    const kioskToken = signKioskToken(jwt, { companyId: "company-a", userId: "kiosk-user", workerId: "worker-1" });

    await controller.createFromKiosk(kioskUser, { ...entry, kioskToken });

    expect(service.create).toHaveBeenCalledWith("company-a", { ...entry, workerId: "worker-1" });
  });

  it("ignores a workerId smuggled into the body", async () => {
    const kioskToken = signKioskToken(jwt, { companyId: "company-a", userId: "kiosk-user", workerId: "worker-1" });

    await controller.createFromKiosk(kioskUser, { ...entry, kioskToken, workerId: "worker-2" } as never);

    expect(service.create.mock.calls[0][1].workerId).toBe("worker-1");
  });

  it("refuses without a valid kiosk token — an access token doesn't count", () => {
    const accessToken = jwt.sign({ userId: "kiosk-user", companyId: "company-a", workerId: "worker-1" });

    expect(() => controller.createFromKiosk(kioskUser, { ...entry, kioskToken: accessToken })).toThrow(ForbiddenException);
    expect(() => controller.createFromKiosk(kioskUser, { ...entry, kioskToken: "garbage" })).toThrow(ForbiddenException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("refuses a kiosk token issued to another session", () => {
    const kioskToken = signKioskToken(jwt, { companyId: "company-a", userId: "other-user", workerId: "worker-1" });

    expect(() => controller.createFromKiosk(kioskUser, { ...entry, kioskToken })).toThrow(ForbiddenException);
  });
});
