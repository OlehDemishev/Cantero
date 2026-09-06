import { BadRequestException } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import * as Sentry from "@sentry/node";
import { SentryExceptionsFilter } from "./sentry-exceptions.filter";

jest.mock("@sentry/node", () => ({ captureException: jest.fn() }));

describe("SentryExceptionsFilter", () => {
  let filter: SentryExceptionsFilter;
  let baseCatchSpy: jest.SpiedFunction<typeof BaseExceptionFilter.prototype.catch>;
  const host = {} as never;

  beforeEach(() => {
    filter = new SentryExceptionsFilter();
    baseCatchSpy = jest.spyOn(BaseExceptionFilter.prototype, "catch").mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    baseCatchSpy.mockRestore();
  });

  it("reports an unexpected error to Sentry and still delegates to the base handler", () => {
    const error = new Error("boom");
    filter.catch(error, host);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(baseCatchSpy).toHaveBeenCalledWith(error, host);
  });

  it("does not report an expected 4xx exception to Sentry, but still delegates the response", () => {
    const exception = new BadRequestException("bad input");
    filter.catch(exception, host);

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(baseCatchSpy).toHaveBeenCalledWith(exception, host);
  });
});
