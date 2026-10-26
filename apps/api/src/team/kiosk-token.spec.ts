import { ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { signKioskToken, verifyKioskToken } from "./kiosk-token";

describe("kiosk tokens", () => {
  const jwt = new JwtService({ secret: "test-secret" });
  const session = { companyId: "company-a", userId: "kiosk-user" };

  it("round-trips the worker for the session it was issued to", () => {
    const token = signKioskToken(jwt, { ...session, workerId: "worker-1" });
    expect(verifyKioskToken(jwt, token, session)).toBe("worker-1");
  });

  it("expires after two minutes", () => {
    jest.useFakeTimers({ now: new Date("2026-10-23T10:00:00Z") });
    try {
      const token = signKioskToken(jwt, { ...session, workerId: "worker-1" });
      jest.setSystemTime(new Date("2026-10-23T10:02:01Z"));
      expect(() => verifyKioskToken(jwt, token, session)).toThrow(ForbiddenException);
    } finally {
      jest.useRealTimers();
    }
  });

  it("refuses a token from another company or another kiosk session", () => {
    const token = signKioskToken(jwt, { ...session, workerId: "worker-1" });
    expect(() => verifyKioskToken(jwt, token, { ...session, companyId: "company-b" })).toThrow(ForbiddenException);
    expect(() => verifyKioskToken(jwt, token, { ...session, userId: "someone-else" })).toThrow(ForbiddenException);
  });

  it("refuses an access token (same secret, no kiosk kind)", () => {
    const accessToken = jwt.sign({ ...session, role: "OWNER", workerId: "worker-1" });
    expect(() => verifyKioskToken(jwt, accessToken, session)).toThrow(ForbiddenException);
  });

  it("refuses a token signed with a different secret", () => {
    const forged = signKioskToken(new JwtService({ secret: "other" }), { ...session, workerId: "worker-1" });
    expect(() => verifyKioskToken(jwt, forged, session)).toThrow(ForbiddenException);
  });
});
