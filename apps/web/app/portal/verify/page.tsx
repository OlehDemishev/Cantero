"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { portalApiFetch, setPortalToken } from "@/lib/portal-api-client";
import { PublicLinkError } from "@/components/public-link-error";
import { useMagicLinkVerify } from "@/lib/use-magic-link-verify";

export default function PortalVerifyPage() {
  const t = useTranslations("portal");
  const router = useRouter();
  const error = useMagicLinkVerify(portalApiFetch, "/portal/auth/verify", (accessToken) => {
    setPortalToken(accessToken);
    router.replace("/portal");
  });

  if (error) {
    return (
      <PublicLinkError
        error={error}
        action={
          <a href="/portal/login" className="btn-primary inline-block">
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
