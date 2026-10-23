"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { subcontractorPortalApiFetch, setSubcontractorPortalToken } from "@/lib/subcontractor-portal-api-client";
import { ApiError } from "@/lib/api-client";
import { PublicLinkError } from "@/components/public-link-error";

export default function SubcontractorPortalVerifyPage() {
  const t = useTranslations("subcontractorPortal");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<unknown>(null);

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
      : Promise.reject(new ApiError(400, "missing token"));
    verified.catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <PublicLinkError
        error={error}
        action={
          <a href="/subcontractor-portal/login" className="btn-primary inline-block">
            {t("backToLogin")}
          </a>
        }
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <p className="text-sm text-fg-subtle">{t("verifying")}</p>
      </div>
    </main>
  );
}
