"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface Assembly {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export function AssemblyQuickAddPanel({ estimateId, onAdded }: { estimateId: string; onAdded: () => void }) {
  const t = useTranslations("assemblies");

  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [assemblyId, setAssemblyId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<Assembly[]>("/assemblies").then((items) => {
      setAssemblies(items);
      if (items[0]) setAssemblyId(items[0].id);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assemblyId) return;
    setBusy(true);
    try {
      await apiFetch(`/estimates/${estimateId}/lines/from-assembly`, {
        method: "POST",
        body: JSON.stringify({ assemblyId, quantity: Number(quantity) }),
      });
      setQuantity("1");
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  if (assemblies.length === 0) return null;

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
      <select className="input" value={assemblyId} onChange={(e) => setAssemblyId(e.target.value)}>
        {assemblies.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.unit})
          </option>
        ))}
      </select>
      <input
        type="number"
        step="0.01"
        min="0.01"
        className="input w-28"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />
      <button type="submit" disabled={busy} className="btn-secondary">
        {t("addToEstimate")}
      </button>
    </form>
  );
}
