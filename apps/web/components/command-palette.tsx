"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useHotkey } from "@/lib/use-hotkey";
import { SearchIcon } from "@/components/nav-icons";
import { resetStateInEffect } from "@/lib/effect-reset";
import { Dialog } from "@/components/ui/dialog";

const DEBOUNCE_MS = 200;

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  link: string;
}
interface NavAction {
  readonly href: string;
  readonly key: string;
}
interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  go: () => void;
}

export function CommandPalette({ navItems }: { navItems: readonly NavAction[] }) {
  const t = useTranslations("commandPalette");
  const tn = useTranslations("nav");
  const td = useTranslations("dialog");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();

  useHotkey("mod+k", () => setOpen((v) => !v));

  useEffect(() => {
    if (!open) return;
    resetStateInEffect(() => {
      setQuery("");
      setResults(null);
      setActiveIndex(0);
    });
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      resetStateInEffect(() => setResults(null));
      return;
    }
    debounceRef.current = setTimeout(() => {
      apiFetch<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`).then(setResults);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Keep the highlighted option visible while arrowing through a long list.
  useEffect(() => {
    if (open) document.getElementById(`${listboxId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, listboxId]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const q = query.trim().toLowerCase();
  const filteredActions = q.length === 0 ? navItems : navItems.filter((item) => tn(item.key).toLowerCase().includes(q));

  const items: PaletteItem[] = [
    ...filteredActions.map((item) => ({ id: `nav:${item.href}`, label: tn(item.key), go: () => go(item.href) })),
    ...(results ?? []).map((r) => ({ id: `${r.type}:${r.id}`, label: r.title, sublabel: r.subtitle, go: () => go(r.link) })),
  ];

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[activeIndex]?.go();
    }
    // Escape is handled by the dialog.
  }

  const activeItem = items[activeIndex];
  const optionId = (index: number) => `${listboxId}-${index}`;

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title={td("commandPalette")}
      hideTitle
      placement="top"
      initialFocusRef={inputRef}
      panelClassName="max-w-lg overflow-hidden"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 focus-within:ring-2 focus-within:ring-inset focus-within:ring-focus/50">
        <SearchIcon width={16} height={16} className="shrink-0 text-fg-subtle" aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeItem ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-label={t("placeholder")}
          className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          placeholder={t("placeholder")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-subtle">Esc</kbd>
      </div>
      <div className="max-h-96 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-fg-subtle">{t("noResults")}</p>
        ) : (
          <ul id={listboxId} role="listbox" aria-label={td("commandPaletteResults")} className="flex flex-col gap-0.5">
            {items.map((item, i) => (
              <li
                key={item.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                onClick={item.go}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full cursor-pointer flex-col items-start rounded-lg px-3 py-2 text-left ${
                  i === activeIndex ? "bg-surface-hover ring-2 ring-inset ring-focus/60" : ""
                }`}
              >
                <span className="text-sm font-medium text-fg">{item.label}</span>
                {item.sublabel && <span className="text-xs text-fg-subtle">{item.sublabel}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
