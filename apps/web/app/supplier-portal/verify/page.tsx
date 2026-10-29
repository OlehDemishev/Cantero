"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supplierPortalApiFetch, setSupplierPortalToken } from "@/lib/supplier-portal-api-client";
import { PublicLinkError } from "@/components/public-link-error";
import { useMagicLinkVerify } from "@/lib/use-magic-link-verify";

export default function SupplierPortalVerifyPage() {
  const t = useTranslations("supplierPortal");
  const router = useRouter();
  const error = useMagicLinkVerify(supplierPortalApiFetch, "/supplier-portal/auth/verify", (accessToken) => {
    setSupplierPortalToken(accessToken);
    router.replace("/supplier-portal");
  });

  if (error) {
    return (
      <PublicLinkError
        error={error}
        action={
          <a href="/supplier-portal/login" className="btn-primary inline-block">
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
