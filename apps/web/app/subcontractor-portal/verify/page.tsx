"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { subcontractorPortalApiFetch, setSubcontractorPortalToken } from "@/lib/subcontractor-portal-api-client";
import { ApiError } from "@/lib/api-client";

export default function SubcontractorPortalVerifyPage() {
  const t = useTranslations("subcontractorPortal");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    const verified = token
      ? subcontractorPortalApiFetch<{ accessToken: string }>("/subcontractor-portal/auth/verify", {
          method: "POST",
          body: JSON.stringify({ token }),
        }).then((res) => {
          setSubcontractorPortalToken(res.accessToken);
          router.replace("/subcontractor-portal");
        })
      : Promise.reject(null);
    verified.catch((err) => setError(err instanceof ApiError ? err.message : t("verifyError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <div className="card">
            <p className="text-sm text-error-700 dark:text-error-500">{error}</p>
            <a href="/subcontractor-portal/login" className="btn-primary mt-4 inline-block">
              {t("backToLogin")}
            </a>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("verifying")}</p>
        )}
      </div>
    </main>
  );
}
