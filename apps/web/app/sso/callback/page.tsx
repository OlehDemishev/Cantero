"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch, setToken } from "@/lib/api-client";

export default function SsoCallbackPage() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    const errorParam = searchParams.get("error");

    async function signIn() {
      if (errorParam) throw new Error(errorParam);
      if (!token) throw new Error(t("ssoError"));
      setToken(token);
      const me = await apiFetch<{ company: { locale: string } }>("/me");
      document.cookie = `NEXT_LOCALE=${me.company.locale};path=/;max-age=31536000`;
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
            <p className="text-sm text-error-700 dark:text-error-500">{error}</p>
            <a href="/login" className="btn-primary mt-4 inline-block">
              {t("backToLogin")}
            </a>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("ssoSigningIn")}</p>
        )}
      </div>
    </main>
  );
}
