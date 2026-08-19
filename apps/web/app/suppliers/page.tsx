"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export default function SuppliersPage() {
  const t = useTranslations("suppliers");
  const tc = useTranslations("common");
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);

  function load() {
    apiFetch<Supplier[]>("/materials/suppliers").then(setSuppliers);
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/materials/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
        }),
      });
      setForm({ name: "", email: "", phone: "" });
      load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("newSupplier")}</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              placeholder={tc("name")}
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder={tc("email")}
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <input
              placeholder={tc("phone")}
              className="input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <button type="submit" disabled={submitting} className="btn-primary">
              {tc("create")}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          {!suppliers ? (
            <p className="text-gray-500">{tc("loading")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {suppliers.map((s) => (
                <li key={s.id} className="card">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-sm text-gray-500">{s.email ?? s.phone ?? "—"}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
