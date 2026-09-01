"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { portalApiFetch } from "@/lib/portal-api-client";

type PortalBrandingResponse = { found: true; name: string; brandColor: string | null; hasLogo: boolean } | { found: false };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export default function PortalLoginPage() {
  const t = useTranslations("portal");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [branding, setBranding] = useState<PortalBrandingResponse>({ found: false });

  useEffect(() => {
    const domain = window.location.hostname;
    portalApiFetch<PortalBrandingResponse>(`/public/portal-branding?domain=${encodeURIComponent(domain)}`)
      .then(setBranding)
      .catch(() => setBranding({ found: false }));
  }, []);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await portalApiFetch("/portal/auth/request-link", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          {branding.found && branding.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_URL}/public/portal-branding/logo?domain=${encodeURIComponent(window.location.hostname)}`}
              alt={branding.name}
              className="h-9 max-w-[180px] object-contain"
            />
          ) : (
            <>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: (branding.found && branding.brandColor) || "#465fff" }}
              >
                {(branding.found ? branding.name : "Cantero").slice(0, 1).toUpperCase()}
              </span>
              <span className="text-lg font-semibold tracking-tight text-gray-900">{branding.found ? branding.name : "Cantero"}</span>
            </>
          )}
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
