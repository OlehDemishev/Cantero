"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";

const CATEGORIES = [
  { id: "gettingStarted", questions: ["q1", "q2", "q3", "q4"] },
  { id: "estimates", questions: ["q1", "q2", "q3", "q4", "q5"] },
  { id: "projects", questions: ["q1", "q2", "q3", "q4"] },
  { id: "materials", questions: ["q1", "q2", "q3", "q4"] },
  { id: "finance", questions: ["q1", "q2", "q3", "q4", "q5"] },
  { id: "subcontractors", questions: ["q1", "q2", "q3", "q4"] },
  { id: "team", questions: ["q1", "q2", "q3", "q4"] },
  { id: "safety", questions: ["q1", "q2", "q3", "q4"] },
  { id: "documents", questions: ["q1", "q2", "q3"] },
  { id: "settings", questions: ["q1", "q2", "q3", "q4"] },
] as const;

export default function HelpPage() {
  const t = useTranslations("help");
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const sections = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const items = cat.questions.map((qid) => ({
        qid,
        question: t(`${cat.id}_${qid}_q`),
        answer: t(`${cat.id}_${qid}_a`),
      }));
      const filtered = normalizedQuery
        ? items.filter(
            (item) => item.question.toLowerCase().includes(normalizedQuery) || item.answer.toLowerCase().includes(normalizedQuery),
          )
        : items;
      return { id: cat.id, title: t(`category_${cat.id}`), items: filtered };
       
    }).filter((section) => section.items.length > 0);
  }, [normalizedQuery]);

  const isSearching = normalizedQuery.length > 0;

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>

      <div className="mt-6 max-w-xl">
        <input
          type="search"
          className="input"
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!isSearching && (
        <nav className="mt-6 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <a key={cat.id} href={`#${cat.id}`} className="btn-secondary px-3 py-1 text-xs">
              {t(`category_${cat.id}`)}
            </a>
          ))}
        </nav>
      )}

      <div className="mt-8 flex flex-col gap-8">
        {sections.length === 0 ? (
          <p className="text-sm text-gray-400">{t("noResults")}</p>
        ) : (
          sections.map((section) => (
            <section key={section.id} id={isSearching ? undefined : section.id}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{section.title}</h2>
              <ul className="flex flex-col gap-2">
                {section.items.map((item) =>
                  isSearching ? (
                    <li key={item.qid} className="card">
                      <div className="text-sm font-medium text-gray-900 dark:text-white/90">{item.question}</div>
                      <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">{item.answer}</p>
                    </li>
                  ) : (
                    <li key={item.qid} className="card">
                      <details>
                        <summary className="cursor-pointer text-sm font-medium text-gray-900 dark:text-white/90">
                          {item.question}
                        </summary>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{item.answer}</p>
                      </details>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ))
        )}
      </div>

      <p className="mt-10 text-xs text-gray-400">
        {t("stillNeedHelp")}{" "}
        <a href="mailto:support@cantero.dev" className="text-brand-600 hover:underline dark:text-brand-400">
          support@cantero.dev
        </a>
      </p>
    </AuthenticatedShell>
  );
}
