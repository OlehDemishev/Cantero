import { assertQuickbooksProductionSafety } from "./quickbooks-production-safety";

describe("assertQuickbooksProductionSafety", () => {
  it("throws when QuickBooks is configured in production with no API base URL set", () => {
    expect(() =>
      assertQuickbooksProductionSafety({ NODE_ENV: "production", QUICKBOOKS_CLIENT_ID: "real-client-id" }),
    ).toThrow(/QUICKBOOKS_API_BASE_URL/);
  });

  it("does not throw in production once QUICKBOOKS_API_BASE_URL is set", () => {
    expect(() =>
      assertQuickbooksProductionSafety({
        NODE_ENV: "production",
        QUICKBOOKS_CLIENT_ID: "real-client-id",
        QUICKBOOKS_API_BASE_URL: "https://quickbooks.api.intuit.com",
      }),
    ).not.toThrow();
  });

  it("does not throw in production when QuickBooks isn't configured at all", () => {
    expect(() => assertQuickbooksProductionSafety({ NODE_ENV: "production" })).not.toThrow();
  });

  it("does not throw outside production, even with QuickBooks configured and no base URL", () => {
    expect(() => assertQuickbooksProductionSafety({ NODE_ENV: "development", QUICKBOOKS_CLIENT_ID: "real-client-id" })).not.toThrow();
    expect(() => assertQuickbooksProductionSafety({ QUICKBOOKS_CLIENT_ID: "real-client-id" })).not.toThrow();
  });
});
