"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchCached } from "./offline-cache";
import { resetStateInEffect } from "./effect-reset";
import { ApiError, getToken } from "./api-client";
import type { Locale } from "@cantero/shared";
import { currentAccount } from "./account";
import { rememberAccount } from "./offline-db";

export interface MeResponse {
  user: { id: string; email: string; name: string; role: string; additionalRoles?: string[]; permissions?: string[]; totpEnabled: boolean; locale: Locale | null };
  /** The language to show: the person's own choice, else the company's. */
  locale: Locale;
  company: {
    id: string;
    name: string;
    unitSystem: "metric" | "imperial";
    currency: string;
    locale: "en" | "de" | "es" | "pl" | "uk";
    country: string;
    onboardingCompletedAt: string | null;
    hiddenNavItems: string[];
    approvalThresholdAmount: string | null;
    requiredApprovalCount: number;
    changeOrderApprovalThresholdAmount: string | null;
    changeOrderRequiredApprovalCount: number;
    budgetAlertThresholdPercent: number;
    payrollTaxBurdenPercent: string | null;
    workersCompBurdenPercent: string | null;
    benefitsBurdenPercent: string | null;
    otherBurdenPercent: string | null;
  };
  subscriptionStatus: "incomplete" | "active" | "past_due" | "canceled";
  emailDigestFrequency: "off" | "daily" | "weekly";
  mutedNotificationTypes: string[];
}

export interface MeState {
  data: MeResponse | null;
  /** True only until the first answer (or failure) — a later `reload` refreshes `data` in place. */
  loading: boolean;
  error: string | null;
  /** The stored token is missing, or the API rejects it (not just "offline" or a server hiccup).
   * AuthenticatedShell clears it and bounces to /login on this. */
  unauthorized: boolean;
  /** Fetches /me again in the background, keeping the current `data` on screen meanwhile. Call it
   * after changing something /me reports (hidden menu items, notification preferences, 2FA…). */
  reload: () => void;
}

const MeContext = createContext<MeState | null>(null);

function useMeFetch(enabled: boolean): MeState {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const reload = useCallback(() => {
    // Without a token the answer is a 401 anyway — don't send a request just to hear it.
    if (!getToken()) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }
    fetchCached<MeResponse>("me", "/me")
      .then(({ data }) => {
        setData(data);
        setError(null);
        setUnauthorized(false);
        // Names this device's offline store after its owner whenever /me loads — so a colleague
        // signing in later can be told whose unsent entries are waiting (OfflineOthersNotice).
        const account = currentAccount();
        if (account) rememberAccount(account.key, data.user.name, data.company.name);
      })
      .catch((err) => {
        setError(err.message);
        setUnauthorized(err instanceof ApiError && err.status === 401);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (enabled) resetStateInEffect(reload);
  }, [enabled, reload]);

  return useMemo(() => ({ data, loading, error, unauthorized, reload }), [data, loading, error, unauthorized, reload]);
}

/**
 * Loads /me once for everything below it — the signed-in app's layout (app/(app)/layout.tsx) — so
 * the menu, the access gate, the page and its panels share one answer instead of each asking again,
 * and navigating between pages doesn't start from "loading" each time.
 */
export function MeProvider({ children }: { children: React.ReactNode }) {
  const value = useMeFetch(true);
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

/** The signed-in member and their company. Inside MeProvider this is the shared answer; outside it
 * (pages that live outside the signed-in layout, e.g. /billing/pending, /onboarding) it loads /me
 * on its own. */
export function useMe(): MeState {
  const shared = useContext(MeContext);
  const own = useMeFetch(shared === null);
  return shared ?? own;
}
