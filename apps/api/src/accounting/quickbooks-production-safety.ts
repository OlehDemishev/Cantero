/**
 * In production, a QuickBooks app that's actually configured (QUICKBOOKS_CLIENT_ID set) without
 * an explicit QUICKBOOKS_API_BASE_URL would silently keep every sync writing into Intuit's
 * sandbox instead of a real company's books — see AccountingSyncService.quickbooksApiBaseUrl()'s
 * own doc comment for why sandbox is the right fallback in dev/test but the wrong one here.
 * Refusing to start is louder and safer than letting a real deployment run for weeks (or years)
 * writing into a sandbox no customer's actual QBO company ever sees. Scoped to only fire when
 * QuickBooks is actually being used (CLIENT_ID set) — a deployment that doesn't use QuickBooks at
 * all shouldn't be blocked by this.
 */
export function assertQuickbooksProductionSafety(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === "production" && env.QUICKBOOKS_CLIENT_ID && !env.QUICKBOOKS_API_BASE_URL) {
    throw new Error(
      "QUICKBOOKS_CLIENT_ID is set and NODE_ENV=production, but QUICKBOOKS_API_BASE_URL is unset — refusing to " +
        'start. Every QuickBooks sync would silently write into Intuit\'s sandbox instead of a real company\'s ' +
        'books. Set QUICKBOOKS_API_BASE_URL="https://quickbooks.api.intuit.com", or unset QUICKBOOKS_CLIENT_ID ' +
        "if QuickBooks sync isn't in use yet.",
    );
  }
}
