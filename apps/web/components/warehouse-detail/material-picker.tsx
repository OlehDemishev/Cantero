"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { resetStateInEffect } from "@/lib/effect-reset";
import type { MaterialCatalogItem } from "./types";

/** Type-ahead SKU entry: type or pick a code from the native datalist, matching sets the id. */
export function MaterialPicker({
  id,
  materials,
  value,
  onChange,
}: {
  id: string;
  materials: MaterialCatalogItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const ta = useTranslations("a11y");
  const [query, setQuery] = useState("");
  const selectedMaterial = materials.find((m) => m.id === value);

  useEffect(() => {
    if (selectedMaterial)
      resetStateInEffect(() => setQuery(selectedMaterial.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMaterial?.id]);

  function handleInput(next: string) {
    setQuery(next);
    const match = materials.find(
      (m) => m.code.toLowerCase() === next.trim().toLowerCase(),
    );
    if (match) onChange(match.id);
  }

  return (
    <>
      <input
        list={id}
        aria-label={ta("material")}
        className="input w-36"
        placeholder="SKU"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
      />
      <datalist id={id}>
        {materials.map((m) => (
          <option key={m.id} value={m.code}>
            {m.name}
          </option>
        ))}
      </datalist>
    </>
  );
}
