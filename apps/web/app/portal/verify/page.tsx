"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { portalApiFetch, setPortalToken } from "@/lib/portal-api-client";
import { ApiError } from "@/lib/api-client";

export default function PortalVerifyPage() {
  const t = useTranslations("portal");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError(t("verifyError"));
      return;
    }
    portalApiFetch<{ accessToken: string }>("/portal/auth/verify", { method: "POST", body: JSON.stringify({ token }) })
      .then((res) => {
        setPortalToken(res.accessToken);
        router.replace("/portal");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("verifyError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <div className="card">
            <p className="text-sm text-error-700">{error}</p>
            <a href="/portal/login" className="btn-primary mt-4 inline-block">
              {t("backToLogin")}
            </a>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t("verifying")}</p>
        )}
      </div>
    </main>
  );
}
