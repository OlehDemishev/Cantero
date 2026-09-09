"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { TabNav, type TabNavItem } from "@/components/ui/tab-nav";
import { apiFetch } from "@/lib/api-client";
import { buildItemDeepLink } from "@/lib/use-deep-linked-row";
import { formatDate } from "@/lib/format-date";

interface WithProject {
  id: string;
  project: { id: string; name: string };
}
interface RfiRow extends WithProject {
  number: string;
  subject: string;
  status: string;
  priority: string;
  dueDate: string | null;
}
interface PunchListRow extends WithProject {
  title: string;
  status: string;
  dueDate: string | null;
}
interface SubmittalRow extends WithProject {
  number: string;
  title: string;
  status: string;
  dueDate: string | null;
}

const TAB_KEYS = ["rfis", "punchList", "submittals"] as const;
type TabKey = (typeof TAB_KEYS)[number];

export default function OpenItemsPage() {
  const t = useTranslations("openItems");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = ((): TabKey => {
    const fromParam = searchParams.get("tab");
    return fromParam && (TAB_KEYS as readonly string[]).includes(fromParam) ? (fromParam as TabKey) : "rfis";
  })();

  const [rfisAll, setRfisAll] = useState<RfiRow[] | null>(null);
  const [punchListAll, setPunchListAll] = useState<PunchListRow[] | null>(null);
  const [submittalsAll, setSubmittalsAll] = useState<SubmittalRow[] | null>(null);

  useEffect(() => {
    apiFetch<RfiRow[]>("/rfis/company-open").then(setRfisAll);
    apiFetch<PunchListRow[]>("/punch-list/company-open").then(setPunchListAll);
    apiFetch<SubmittalRow[]>("/submittals/company-pending").then(setSubmittalsAll);
  }, []);

  // Portfolio links here with ?projectId= so its per-project RFI/punch-list/submittal counts
  // aren't just a dead-end number — clicking one drills into the matching open items.
  const projectIdFilter = searchParams.get("projectId");
  const projectNameFilter = rfisAll?.find((r) => r.project.id === projectIdFilter)?.project.name
    ?? punchListAll?.find((p) => p.project.id === projectIdFilter)?.project.name
    ?? submittalsAll?.find((s) => s.project.id === projectIdFilter)?.project.name
    ?? null;
  const rfis = projectIdFilter ? rfisAll?.filter((r) => r.project.id === projectIdFilter) ?? null : rfisAll;
  const punchList = projectIdFilter ? punchListAll?.filter((p) => p.project.id === projectIdFilter) ?? null : punchListAll;
  const submittals = projectIdFilter ? submittalsAll?.filter((s) => s.project.id === projectIdFilter) ?? null : submittalsAll;

  const counts: Record<TabKey, number | null> = {
    rfis: rfis?.length ?? null,
    punchList: punchList?.length ?? null,
    submittals: submittals?.length ?? null,
  };
  const TABS: TabNavItem[] = TAB_KEYS.map((key) => ({
    key,
    label: `${t(`tab_${key}`)}${counts[key] !== null ? ` (${counts[key]})` : ""}`,
  }));

  function setTab(key: string) {
    router.replace(`/open-items?tab=${key}`, { scroll: false });
  }

  function projectLink(projectId: string, itemType: string, itemId: string, tab: string) {
    return buildItemDeepLink(projectId, tab, itemType, itemId);
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("subtitle")}</p>
      {projectIdFilter && (
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {t("filteredByProject", { project: projectNameFilter ?? projectIdFilter })}{" "}
          <button onClick={() => router.replace(`/open-items?tab=${activeTab}`)} className="text-brand-700 dark:text-brand-400 hover:underline">
            {t("clearFilter")}
          </button>
        </p>
      )}

      <TabNav tabs={TABS} active={activeTab} onChange={setTab} />

      {activeTab === "rfis" && (
        <div className="mt-4">
          {rfis === null ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
          ) : rfis.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noOpenRfis")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2">{t("project")}</th>
                  <th>{t("number")}</th>
                  <th>{t("subject")}</th>
                  <th>{t("status")}</th>
                  <th>{t("priority")}</th>
                  <th>{t("dueDate")}</th>
                </tr>
              </thead>
              <tbody>
                {rfis.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">
                      <a href={projectLink(r.project.id, "rfi", r.id, "quality")} className="text-brand-700 dark:text-brand-400 hover:underline">
                        {r.project.name}
                      </a>
                    </td>
                    <td className="font-mono text-xs text-gray-400 dark:text-gray-500">{r.number}</td>
                    <td>{r.subject}</td>
                    <td>{r.status}</td>
                    <td>{r.priority}</td>
                    <td>{r.dueDate ? formatDate(new Date(r.dueDate)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "punchList" && (
        <div className="mt-4">
          {punchList === null ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
          ) : punchList.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noOpenPunchList")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2">{t("project")}</th>
                  <th>{t("itemTitle")}</th>
                  <th>{t("status")}</th>
                  <th>{t("dueDate")}</th>
                </tr>
              </thead>
              <tbody>
                {punchList.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">
                      <a href={projectLink(p.project.id, "punch_list", p.id, "quality")} className="text-brand-700 dark:text-brand-400 hover:underline">
                        {p.project.name}
                      </a>
                    </td>
                    <td>{p.title}</td>
                    <td>{p.status}</td>
                    <td>{p.dueDate ? formatDate(new Date(p.dueDate)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "submittals" && (
        <div className="mt-4">
          {submittals === null ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
          ) : submittals.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noPendingSubmittals")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2">{t("project")}</th>
                  <th>{t("number")}</th>
                  <th>{t("itemTitle")}</th>
                  <th>{t("dueDate")}</th>
                </tr>
              </thead>
              <tbody>
                {submittals.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">
                      <a href={projectLink(s.project.id, "submittal", s.id, "quality")} className="text-brand-700 dark:text-brand-400 hover:underline">
                        {s.project.name}
                      </a>
                    </td>
                    <td className="font-mono text-xs text-gray-400 dark:text-gray-500">{s.number}</td>
                    <td>{s.title}</td>
                    <td>{s.dueDate ? formatDate(new Date(s.dueDate)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </AuthenticatedShell>
  );
}
