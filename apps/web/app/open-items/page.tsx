"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { TabNav, type TabNavItem } from "@/components/ui/tab-nav";
import { apiFetch } from "@/lib/api-client";
import { buildItemDeepLink } from "@/lib/use-deep-linked-row";

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

  const [rfis, setRfis] = useState<RfiRow[] | null>(null);
  const [punchList, setPunchList] = useState<PunchListRow[] | null>(null);
  const [submittals, setSubmittals] = useState<SubmittalRow[] | null>(null);

  useEffect(() => {
    apiFetch<RfiRow[]>("/rfis/company-open").then(setRfis);
    apiFetch<PunchListRow[]>("/punch-list/company-open").then(setPunchList);
    apiFetch<SubmittalRow[]>("/submittals/company-pending").then(setSubmittals);
  }, []);

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
      <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>

      <TabNav tabs={TABS} active={activeTab} onChange={setTab} />

      {activeTab === "rfis" && (
        <div className="mt-4">
          {rfis === null ? (
            <p className="text-sm text-gray-400">{tc("loading")}</p>
          ) : rfis.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noOpenRfis")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
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
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-2">
                      <a href={projectLink(r.project.id, "rfi", r.id, "quality")} className="text-brand-700 hover:underline">
                        {r.project.name}
                      </a>
                    </td>
                    <td className="font-mono text-xs text-gray-400">{r.number}</td>
                    <td>{r.subject}</td>
                    <td>{r.status}</td>
                    <td>{r.priority}</td>
                    <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "punchList" && (
        <div className="mt-4">
          {punchList === null ? (
            <p className="text-sm text-gray-400">{tc("loading")}</p>
          ) : punchList.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noOpenPunchList")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{t("project")}</th>
                  <th>{t("itemTitle")}</th>
                  <th>{t("status")}</th>
                  <th>{t("dueDate")}</th>
                </tr>
              </thead>
              <tbody>
                {punchList.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-2">
                      <a href={projectLink(p.project.id, "punch_list", p.id, "quality")} className="text-brand-700 hover:underline">
                        {p.project.name}
                      </a>
                    </td>
                    <td>{p.title}</td>
                    <td>{p.status}</td>
                    <td>{p.dueDate ? new Date(p.dueDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "submittals" && (
        <div className="mt-4">
          {submittals === null ? (
            <p className="text-sm text-gray-400">{tc("loading")}</p>
          ) : submittals.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noPendingSubmittals")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{t("project")}</th>
                  <th>{t("number")}</th>
                  <th>{t("itemTitle")}</th>
                  <th>{t("dueDate")}</th>
                </tr>
              </thead>
              <tbody>
                {submittals.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-2">
                      <a href={projectLink(s.project.id, "submittal", s.id, "quality")} className="text-brand-700 hover:underline">
                        {s.project.name}
                      </a>
                    </td>
                    <td className="font-mono text-xs text-gray-400">{s.number}</td>
                    <td>{s.title}</td>
                    <td>{s.dueDate ? new Date(s.dueDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </AuthenticatedShell>
  );
}
