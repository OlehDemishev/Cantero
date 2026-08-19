"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api-client";

export interface MeResponse {
  user: { id: string; email: string; name: string; role: string };
  company: {
    id: string;
    name: string;
    unitSystem: "metric" | "imperial";
    currency: string;
    locale: "en" | "de" | "es";
    country: string;
  };
  subscriptionStatus: "incomplete" | "active" | "past_due" | "canceled";
}

export function useMe() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch<MeResponse>("/me")
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
