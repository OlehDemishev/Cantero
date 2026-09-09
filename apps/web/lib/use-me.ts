"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCached } from "./offline-cache";
import { resetStateInEffect } from "./effect-reset";
import { ApiError } from "./api-client";

export interface MeResponse {
  user: { id: string; email: string; name: string; role: string; totpEnabled: boolean };
  company: {
    id: string;
    name: string;
    unitSystem: "metric" | "imperial";
    currency: string;
    locale: "en" | "de" | "es" | "pl" | "uk";
    country: string;
    onboardingCompletedAt: string | null;
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

export function useMe() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A 401 here means the stored token is invalid/expired (not just "offline" or "server hiccup") —
  // AuthenticatedShell uses this to clear it and bounce to /login, since without it the page would
  // otherwise sit on the loading state forever: `!getToken()` only catches a *missing* token.
  const [unauthorized, setUnauthorized] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    fetchCached<MeResponse>("me", "/me")
      .then(({ data }) => setData(data))
      .catch((err) => {
        setError(err.message);
        setUnauthorized(err instanceof ApiError && err.status === 401);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    resetStateInEffect(reload);
  }, [reload]);

  return { data, loading, error, unauthorized, reload };
}
