"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { subcontractorPortalApiFetch, setSubcontractorPortalToken } from "@/lib/subcontractor-portal-api-client";
import { PublicLinkError } from "@/components/public-link-error";
import { useMagicLinkVerify } from "@/lib/use-magic-link-verify";

export default function SubcontractorPortalVerifyPage() {
  const t = useTranslations("subcontractorPortal");
  const router = useRouter();
  const error = useMagicLinkVerify(subcontractorPortalApiFetch, "/subcontractor-portal/auth/verify", (accessToken) => {
    setSubcontractorPortalToken(accessToken);
    router.replace("/subcontractor-portal");
  });

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
