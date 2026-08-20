"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

export default function BillingPendingPage() {
  const t = useTranslations("billing");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data, loading } = useMe();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.subscriptionStatus !== "active") return;
    const needsOnboarding = data.user.role === "owner" && !data.company.onboardingCompletedAt;
    router.replace(needsOnboarding ? "/onboarding" : "/dashboard");
  }, [data, router]);

  async function startCheckout() {
    setStarting(true);
    setError(null);
    try {
      const res = await apiFetch<{ url: string }>("/billing/checkout-session", { method: "POST" });
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc("error"));
      setStarting(false);
    }
  }

  if (loading) return <Centered>{tc("loading")}</Centered>;

  return (
    <Centered>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-600">{t("subtitle")}</p>
      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button onClick={startCheckout} disabled={starting} className="btn-primary mt-6">
        {starting ? tc("loading") : t("checkoutButton")}
      </button>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      {children}
    </main>
  );
}
