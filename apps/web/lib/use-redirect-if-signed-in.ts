"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "./api-client";

/** For /login and /signup: someone already signed in has nothing to do there, so it goes on to the
 * dashboard. A stored token the API no longer accepts comes straight back here — the signed-in
 * layout clears it on the 401 — so this can't loop. */
export function useRedirectIfSignedIn(): void {
  const router = useRouter();
  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);
}
