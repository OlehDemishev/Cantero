import { useEffect, useState } from "react";
import { ApiError } from "./api-client";
import type { Locale } from "@cantero/shared";
import { fetchCached } from "./offline-cache";

export interface Me {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    /** What this member may do — see packages/shared permissions.ts. */
    permissions?: string[];
    /** Their own language choice; null follows the company's. */
    locale?: Locale | null;
  };
  /** The language to show them in: their own choice, else the company's. */
  locale?: Locale;
  company?: { locale: Locale };
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  // A 401 means the stored token is expired or revoked, not that the device is offline — the shell
  // signs out on it, otherwise every tab would sit on an error with no way forward.
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    fetchCached<Me>("me", "/me")
      .then(({ data }) => setMe(data))
      .catch((err: unknown) => {
        setFailed(true);
        setUnauthorized(err instanceof ApiError && err.status === 401);
      });
  }, []);

  return { me, failed, unauthorized };
}
