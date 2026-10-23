import { ForbiddenException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";

/** Marks a JWT as a kiosk clock-in token: proof that a worker just typed their PIN on a shared
 * kiosk device. It's signed with the same secret as access tokens, so the `kind` is what keeps
 * the two apart — JwtAuthGuard refuses any token carrying a `kind`, and verifyKioskToken()
 * refuses anything (an access token included) that doesn't carry this one. */
export const KIOSK_TOKEN_KIND = "kiosk_clock_in";

/** Long enough to pick a project and type hours after the PIN, short enough that a token left
 * behind on the device is useless to the next person in line. */
export const KIOSK_TOKEN_TTL = "2m";

export interface KioskTokenClaims {
  companyId: string;
  workerId: string;
  /** The account the kiosk device is signed in with — the token only works from that session. */
  userId: string;
}

export function signKioskToken(jwt: JwtService, claims: KioskTokenClaims): string {
  return jwt.sign(
    { kind: KIOSK_TOKEN_KIND, companyId: claims.companyId, workerId: claims.workerId, userId: claims.userId },
    { expiresIn: KIOSK_TOKEN_TTL },
  );
}

/** Verifies a token from signKioskToken() for the kiosk session `session` and returns the worker
 * it names. Expired, foreign-company, other-session and non-kiosk tokens are all refused with a
 * 403 — not 401, which the kiosk page reads as its own sign-in having expired. */
export function verifyKioskToken(jwt: JwtService, token: string, session: { companyId: string; userId: string }): string {
  let payload: Record<string, unknown>;
  try {
    payload = jwt.verify<Record<string, unknown>>(token);
  } catch {
    throw new ForbiddenException("Your PIN check has expired — enter your PIN again");
  }
  if (
    payload.kind !== KIOSK_TOKEN_KIND ||
    payload.companyId !== session.companyId ||
    payload.userId !== session.userId ||
    typeof payload.workerId !== "string" ||
    !payload.workerId
  ) {
    throw new ForbiddenException("Enter your PIN again");
  }
  return payload.workerId;
}
