"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { SearchIcon } from "@/components/nav-icons";

type ResultType =
  | "project"
  | "client"
  | "invoice"
  | "estimate"
  | "document"
  | "worker"
  | "supplier"
  | "rfi"
  | "punch_list_item"
  | "submittal"
  | "incident_report"
  | "warranty_claim"
  | "daily_log"
  | "task";
interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle: string;
  link: string;
  /** Set on results found by meaning rather than by the words typed. */
  byMeaning?: boolean;
  /** Found by meaning: other records with exactly this text, folded into this result. */
  sameTextCount?: number;
}

const DEBOUNCE_MS = 250;

export function GlobalSearch() {
  const t = useTranslations("search");
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the latest query's answer is shown, however the two requests race.
  const requestRef = useRef(0);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const request = ++requestRef.current;
      const q = encodeURIComponent(value);
      apiFetch<SearchResult[]>(`/search?q=${q}`).then((r) => {
        if (request !== requestRef.current) return;
        setResults((prev) => [...r, ...(prev ?? []).filter((x) => x.byMeaning && !r.some((y) => y.id === x.id))]);
        setOpen(true);
      });
      // Meaning-based results (any language) follow the word matches; a server with it turned off
      // answers 400, which just means there is no second group.
      apiFetch<SearchResult[]>(`/search/semantic?q=${q}`)
        .then((r) => {
          if (request !== requestRef.current) return;
          setResults((prev) => {
            const words = (prev ?? []).filter((x) => !x.byMeaning);
            return [...words, ...r.filter((x) => !words.some((y) => y.id === x.id)).map((x) => ({ ...x, byMeaning: true }))];
          });
          setOpen(true);
        })
        .catch(() => {});
    }, DEBOUNCE_MS);
  }

  function go(result: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults(null);
    router.push(result.link);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !results || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      go(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative w-full max-w-sm" ref={containerRef}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
          <SearchIcon width={16} height={16} />
        </span>
        <input
          className="input w-full pl-9 text-sm"
          placeholder={t("placeholder")}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results && setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 max-h-96 w-full min-w-[320px] overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-theme-md dark:border-gray-800 dark:bg-gray-900">
          {!results || results.length === 0 ? (
            <p className="px-2 py-3 text-sm text-gray-400 dark:text-gray-500">{t("noResults")}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {results.map((r, i) => (
                <li key={`${r.type}:${r.id}`}>
                  {r.byMeaning && !results[i - 1]?.byMeaning && (
                    <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{t("byMeaning")}</p>
                  )}
                  <button
                    onClick={() => go(r)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left ${
                      i === activeIndex ? "bg-gray-100 dark:bg-white/5" : ""
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-medium text-gray-800 dark:text-white/90">{r.title}</span>
                      {r.subtitle && <span className="block text-xs text-gray-500 dark:text-gray-400">{r.subtitle}</span>}
                      {!!r.sameTextCount && (
                        <span className="block text-xs text-gray-400 dark:text-gray-500">{t("sameTextMore", { count: r.sameTextCount })}</span>
                      )}
                    </span>
                    <span className="ml-2 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-white/10 dark:text-gray-400">
                      {t(`type_${r.type}`)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
