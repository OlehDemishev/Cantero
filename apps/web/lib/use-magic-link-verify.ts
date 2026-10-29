"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api-client";

type PortalFetch = <T>(path: string, options?: RequestInit) => Promise<T>;

/** Verify requests still in flight, keyed by endpoint and token. Magic-link tokens are single-use,
 * so a second mount of the verify page (React StrictMode in dev, or a remount while the request is
 * pending) must join the first request rather than send its own and get a 400 for a spent token. */
const pending = new Map<string, Promise<string>>();

function verifyOnce(fetcher: PortalFetch, path: string, token: string): Promise<string> {
  const key = `${path} ${token}`;
  let request = pending.get(key);
  if (!request) {
    request = fetcher<{ accessToken: string }>(path, { method: "POST", body: JSON.stringify({ token }) }).then(
      (res) => res.accessToken,
    );
    // Dropped once settled: a later visit to the same link asks the server again, which decides.
    request.then(
      () => pending.delete(key),
      () => pending.delete(key),
    );
    pending.set(key, request);
  }
  return request;
}

/** Exchanges the `?token=` of a portal magic link for an access token, once per token, and hands
 * it to `onSignedIn`. Returns the error to show, if the link is missing, spent or expired. */
export function useMagicLinkVerify(fetcher: PortalFetch, path: string, onSignedIn: (accessToken: string) => void): unknown {
  const searchParams = useSearchParams();
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    // Only the mount that is still alive acts on the result; an unmounted StrictMode pass stays quiet.
    let cancelled = false;
    const token = searchParams.get("token");
    const verified = token ? verifyOnce(fetcher, path, token) : Promise.reject(new ApiError(400, "missing token"));
    verified.then(
      (accessToken) => {
        if (!cancelled) onSignedIn(accessToken);
      },
      (err: unknown) => {
        if (!cancelled) setError(err);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return error;
}
