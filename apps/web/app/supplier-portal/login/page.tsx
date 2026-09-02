"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { supplierPortalApiFetch } from "@/lib/supplier-portal-api-client";

export default function SupplierPortalLoginPage() {
  const t = useTranslations("supplierPortal");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await supplierPortalApiFetch("/supplier-portal/auth/request-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight text-gray-900">Cantero</span>
        </div>

        <div className="card">
          <h1 className="text-xl font-semibold text-gray-900">{t("signInTitle")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("signInHint")}</p>

          {sent ? (
            <p className="mt-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">
              {t("linkSentHint")}
            </p>
          ) : (
            <form onSubmit={requestLink} className="mt-4 flex flex-col gap-3">
              <input
                required
                type="email"
                placeholder={t("emailPlaceholder")}
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" disabled={busy} className="btn-primary">
                {t("sendLink")}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
