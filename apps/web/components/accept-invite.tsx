"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError, setToken } from "@/lib/api-client";
import { Alert } from "@/components/ui/alert";

interface InviteInfo {
  email: string;
  role: string;
  company: { name: string; locale: string };
}

export function AcceptInvite({ token }: { token: string }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [invite, setInvite] = useState<InviteInfo | null | "invalid">(null);
  const [form, setForm] = useState({ name: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<InviteInfo>(`/invites/${token}`)
      .then(setInvite)
      .catch(() => setInvite("invalid"));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ accessToken: string }>("/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token, name: form.name, password: form.password }),
      });
      setToken(res.accessToken);
      if (invite && invite !== "invalid") {
        document.cookie = `NEXT_LOCALE=${invite.company.locale};path=/;max-age=31536000`;
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc("error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (invite === "invalid") {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-gray-600 dark:text-gray-300">{t("inviteInvalid")}</p>
      </main>
    );
  }

  if (!invite) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-fg-subtle">{tc("loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold text-fg">{t("acceptInviteTitle", { company: invite.company.name })}</h1>
      <p className="mt-1 text-sm text-fg-subtle">{t("acceptInviteSubtitle", { role: t(invite.role) })}</p>

      {error && <Alert tone="danger" className="mt-4">{error}</Alert>}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-fg-muted">{t("yourName")}</span>
          <input
            required
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-fg-muted">{t("password")}</span>
          <input
            required
            type="password"
            minLength={8}
            className="input"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </label>
        <button type="submit" disabled={submitting} className="btn-primary mt-2">
          {submitting ? tc("loading") : t("acceptInvite")}
        </button>
      </form>
    </main>
  );
}
