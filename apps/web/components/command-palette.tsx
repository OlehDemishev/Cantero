"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useHotkey } from "@/lib/use-hotkey";
import { SearchIcon } from "@/components/nav-icons";
import { resetStateInEffect } from "@/lib/effect-reset";

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
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useHotkey("mod+k", () => setOpen((v) => !v));

  useEffect(() => {
    if (!open) return;
    resetStateInEffect(() => {
      setQuery("");
      setResults(null);
      setActiveIndex(0);
    });
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
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
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-gray-900/50 pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <SearchIcon width={16} height={16} className="shrink-0 text-gray-400 dark:text-gray-500" />
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90"
            placeholder={t("placeholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400 dark:border-gray-700 dark:text-gray-500">
            Esc
          </kbd>
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-gray-400 dark:text-gray-500">{t("noResults")}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {items.map((item, i) => (
                <li key={item.id}>
                  <button
                    onClick={item.go}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left ${
                      i === activeIndex ? "bg-gray-100 dark:bg-white/5" : ""
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-800 dark:text-white/90">{item.label}</span>
                    {item.sublabel && <span className="text-xs text-gray-500 dark:text-gray-400">{item.sublabel}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
