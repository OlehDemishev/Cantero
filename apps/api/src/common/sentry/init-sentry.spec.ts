import * as Sentry from "@sentry/node";
import { initSentry } from "./init-sentry";

jest.mock("@sentry/node", () => ({ init: jest.fn() }));

describe("initSentry", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  it("does nothing when SENTRY_DSN is not set", () => {
    delete process.env.SENTRY_DSN;
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("initializes Sentry with the configured DSN when set", () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/123";
    initSentry();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: "https://example@sentry.io/123" }));
  });

  it("defaults environment to development and honors NODE_ENV when set", () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/123";
    process.env.NODE_ENV = "production";
    initSentry();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ environment: "production" }));
  });
});
