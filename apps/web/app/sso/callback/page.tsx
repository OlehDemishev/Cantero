"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, setToken } from "@/lib/api-client";
import { takeSsoNonce } from "@/lib/sso-nonce";

export default function SsoCallbackPage() {
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  // The code and nonce are single-use; a second effect run (React StrictMode in dev) must not try again.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errorParam = params.get("error");
    // First thing: the one-time code leaves the address bar and this history entry, so it can't be
    // copied, bookmarked, synced or reported from here on.
    if (code) window.history.replaceState(null, "", window.location.pathname);
    const nonce = takeSsoNonce();

    async function signIn() {
      if (errorParam) throw new Error(errorParam);
      if (!code) throw new Error(t("ssoError"));
      // No nonce means this tab never started an SSO sign-in — e.g. a callback link someone sent.
      if (!nonce) throw new Error(t("ssoStartedElsewhere"));
      const { accessToken } = await apiFetch<{ accessToken: string }>("/auth/sso/exchange", {
        method: "POST",
        body: JSON.stringify({ code, nonce }),
      });
      setToken(accessToken);
      const me = await apiFetch<{ locale: string }>("/me");
      document.cookie = `NEXT_LOCALE=${me.locale};path=/;max-age=31536000`;
      window.location.href = "/dashboard";
    }

    signIn().catch((err) => setError(err instanceof Error ? err.message : t("ssoError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <div className="card">
            <p className="text-sm text-danger-fg">{error}</p>
            <a href="/login" className="btn-primary mt-4 inline-block">
              {t("backToLogin")}
            </a>
          </div>
        ) : (
          <p className="text-sm text-fg-subtle">{t("ssoSigningIn")}</p>
        )}
      </div>
    </main>
  );
}
