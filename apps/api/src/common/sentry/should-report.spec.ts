import { BadRequestException, HttpException, HttpStatus, InternalServerErrorException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { shouldReportToSentry } from "./should-report";

describe("shouldReportToSentry", () => {
  it("reports a raw (non-HTTP) error — always a bug, never expected", () => {
    expect(shouldReportToSentry(new Error("boom"))).toBe(true);
  });

  it("reports a generic thrown value that isn't even an Error", () => {
    expect(shouldReportToSentry("boom")).toBe(true);
  });

  it.each([
    ["BadRequestException (400)", new BadRequestException("bad input")],
    ["UnauthorizedException (401)", new UnauthorizedException("nope")],
    ["NotFoundException (404)", new NotFoundException("missing")],
    ["429 Too Many Requests (RateLimiterService)", new HttpException("slow down", HttpStatus.TOO_MANY_REQUESTS)],
  ])("does not report an expected 4xx exception: %s", (_label, exception) => {
    expect(shouldReportToSentry(exception)).toBe(false);
  });

  it("reports a 500-level HttpException — that's a real bug even if it's wrapped", () => {
    expect(shouldReportToSentry(new InternalServerErrorException("db is down"))).toBe(true);
  });

  it("reports a custom HttpException at 502", () => {
    expect(shouldReportToSentry(new HttpException("upstream failed", HttpStatus.BAD_GATEWAY))).toBe(true);
  });
});
