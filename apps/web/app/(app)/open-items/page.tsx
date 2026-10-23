"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { TabNav, TabPanel, type TabNavItem } from "@/components/ui/tab-nav";
import { useApi } from "@/lib/use-api";
import { useCan } from "@/lib/permissions";
import { buildItemDeepLink } from "@/lib/use-deep-linked-row";
import { formatDate } from "@/lib/format-date";
import { PageHeader } from "@/components/ui/page-header";

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
  const tRfi = useTranslations("rfi");
  const tPunch = useTranslations("punchList");
  const router = useRouter();
  const searchParams = useSearchParams();
  // Pending submittals are a site-management list (site.manage); without it the tab isn't offered.
  const seesSubmittals = useCan()("site.manage");
  const tabKeys = TAB_KEYS.filter((key) => key !== "submittals" || seesSubmittals);
  const activeTab = ((): TabKey => {
    const fromParam = searchParams.get("tab");
    return fromParam && (tabKeys as readonly string[]).includes(fromParam) ? (fromParam as TabKey) : "rfis";
  })();

  const { data: rfisAll = null } = useApi<RfiRow[]>("/rfis/company-open");
  const { data: punchListAll = null } = useApi<PunchListRow[]>("/punch-list/company-open");
  const { data: submittalsAll = null } = useApi<SubmittalRow[]>(seesSubmittals ? "/submittals/company-pending" : null);

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
  const TABS: TabNavItem[] = tabKeys.map((key) => ({
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
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      {projectIdFilter && (
        <p className="mt-1 text-xs text-fg-subtle">
          {t("filteredByProject", { project: projectNameFilter ?? projectIdFilter })}{" "}
          <button onClick={() => router.replace(`/open-items?tab=${activeTab}`)} className="text-brand-700 dark:text-brand-400 hover:underline">
            {t("clearFilter")}
          </button>
        </p>
      )}

      <TabNav id="open-items-tabs" tabs={TABS} active={activeTab} onChange={setTab} />
      <TabPanel tabsId="open-items-tabs" active={activeTab}>

        {activeTab === "rfis" && (
          <div className="mt-4">
            {rfis === null ? (
              <p className="text-sm text-fg-subtle">{tc("loading")}</p>
            ) : rfis.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t("noOpenRfis")}</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
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
                      <td className="font-mono text-xs text-fg-subtle">{r.number}</td>
                      <td>{r.subject}</td>
                      <td>{tRfi.has(r.status) ? tRfi(r.status) : r.status}</td>
                      <td>{tRfi.has(r.priority) ? tRfi(r.priority) : r.priority}</td>
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
              <p className="text-sm text-fg-subtle">{tc("loading")}</p>
            ) : punchList.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t("noOpenPunchList")}</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
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
                      <td>{tPunch.has(p.status) ? tPunch(p.status) : p.status}</td>
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
              <p className="text-sm text-fg-subtle">{tc("loading")}</p>
            ) : submittals.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t("noPendingSubmittals")}</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
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
                      <td className="font-mono text-xs text-fg-subtle">{s.number}</td>
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
      </TabPanel>
    </>
  );
}
