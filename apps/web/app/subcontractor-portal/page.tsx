"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApiError, notifyApiError } from "@/lib/api-client";
import {
  getSubcontractorPortalToken,
  subcontractorPortalApiFetch,
  signOutSubcontractorPortal,
  clearSubcontractorPortalToken,
} from "@/lib/subcontractor-portal-api-client";
import { SignaturePad } from "@/components/signature-pad";
import { formatDate } from "@/lib/format-date";
import { formatCurrency } from "@/lib/format-currency";
import { useCompanyLocale } from "@/components/public-locale";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";

interface Me {
  name: string;
  companyName: string;
  locale: string;
  currency: string;
}
interface Assignment {
  id: string;
  project: { id: string; name: string; address: string | null };
}
interface Cost {
  id: string;
  description: string;
  amount: string;
  incurredDate: string;
  paid: boolean;
  project: { name: string };
}
type LienWaiverType = "conditional_progress" | "unconditional_progress" | "conditional_final" | "unconditional_final";
interface LienWaiver {
  id: string;
  type: LienWaiverType;
  amount: string;
  requestedAt: string;
  signedAt: string | null;
  signerName: string | null;
  project: { name: string };
}
type BidRequestStatus = "open" | "awarded" | "cancelled";
interface MyBid {
  amount: string;
  notes: string | null;
  isAwarded: boolean;
}
interface BidRequest {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: BidRequestStatus;
  project: { name: string };
  bids: MyBid[];
}
type PunchListItemStatus = "open" | "resolved" | "verified";
interface MyPunchListItem {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  status: PunchListItemStatus;
  dueDate: string | null;
  project: { id: string; name: string };
}

export default function SubcontractorPortalDashboardPage() {
  const t = useTranslations("subcontractorPortal");
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  useCompanyLocale(me?.locale);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [costs, setCosts] = useState<Cost[] | null>(null);
  const [waivers, setWaivers] = useState<LienWaiver[] | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [bidRequests, setBidRequests] = useState<BidRequest[] | null>(null);
  const [punchListItems, setPunchListItems] = useState<MyPunchListItem[] | null>(null);
  const [bidForms, setBidForms] = useState<Record<string, { amount: string; notes: string }>>({});
  const [bidLinesText, setBidLinesText] = useState<Record<string, string>>({});
  const [bidBusyId, setBidBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({ projectId: "", description: "", amount: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadCosts() {
    subcontractorPortalApiFetch<Cost[]>("/subcontractor-portal/costs").then(setCosts).catch(notifyApiError);
  }

  function loadWaivers() {
    subcontractorPortalApiFetch<LienWaiver[]>("/subcontractor-portal/lien-waivers").then(setWaivers).catch(notifyApiError);
  }

  function loadBidRequests() {
    subcontractorPortalApiFetch<BidRequest[]>("/subcontractor-portal/bid-requests").then((list) => {
      setBidRequests(list);
      setBidForms((prev) => {
        const next = { ...prev };
        for (const r of list) {
          if (!next[r.id]) {
            const mine = r.bids[0];
            next[r.id] = { amount: mine?.amount ?? "", notes: mine?.notes ?? "" };
          }
        }
        return next;
      });
    }).catch(notifyApiError);
  }

  useEffect(() => {
    if (!getSubcontractorPortalToken()) {
      router.replace("/subcontractor-portal/login");
      return;
    }
    subcontractorPortalApiFetch<Me>("/subcontractor-portal/me")
      .then(setMe)
      .catch((err) => {
        // Signed out on another device, or no longer on file: back to the sign-in page.
        if (err instanceof ApiError && err.status === 401) {
          clearSubcontractorPortalToken();
          router.replace("/subcontractor-portal/login");
        }
      });
    subcontractorPortalApiFetch<Assignment[]>("/subcontractor-portal/projects").then((list) => {
      setAssignments(list);
      if (list[0]) setForm((f) => ({ ...f, projectId: f.projectId || list[0].project.id }));
    }).catch(notifyApiError);
    loadCosts();
    loadWaivers();
    loadBidRequests();
    subcontractorPortalApiFetch<MyPunchListItem[]>("/subcontractor-portal/punch-list-items").then(setPunchListItems).catch(notifyApiError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await signOutSubcontractorPortal();
    router.replace("/subcontractor-portal/login");
  }

  async function submitCost(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await subcontractorPortalApiFetch("/subcontractor-portal/costs", {
        method: "POST",
        body: JSON.stringify({
          projectId: form.projectId,
          description: form.description,
          amount: Number(form.amount),
        }),
      });
      setForm((f) => ({ ...f, description: "", amount: "" }));
      loadCosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("verifyError"));
    } finally {
      setBusy(false);
    }
  }

  async function signWaiver(waiverId: string) {
    if (!signerName.trim() || !signatureDataUrl) return;
    setBusy(true);
    setError(null);
    try {
      await subcontractorPortalApiFetch(`/subcontractor-portal/lien-waivers/${waiverId}/sign`, {
        method: "POST",
        body: JSON.stringify({ signerName: signerName.trim(), signatureDataUrl }),
      });
      setSigningId(null);
      setSignerName("");
      setSignatureDataUrl(null);
      loadWaivers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("verifyError"));
    } finally {
      setBusy(false);
    }
  }

  function parseBidLines(text: string) {
    const lines = text
      .split("\n")
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row) => {
        const [description, amount, included] = row.split("|").map((part) => part.trim());
        return { description, amount: Number(amount), included: included ? included.toLowerCase().startsWith("y") : true };
      })
      .filter((line) => line.description && Number.isFinite(line.amount));
    return lines.length > 0 ? lines : undefined;
  }

  async function submitBid(bidRequestId: string) {
    const form = bidForms[bidRequestId];
    if (!form || !form.amount) return;
    setBidBusyId(bidRequestId);
    setError(null);
    try {
      await subcontractorPortalApiFetch(`/subcontractor-portal/bid-requests/${bidRequestId}/bid`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(form.amount),
          notes: form.notes || undefined,
          lines: parseBidLines(bidLinesText[bidRequestId] ?? ""),
        }),
      });
      loadBidRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("verifyError"));
    } finally {
      setBidBusyId(null);
    }
  }

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
        <p className="text-sm text-fg-subtle">{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-700 px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
              C
            </span>
            <div>
              <p className="text-sm font-semibold text-fg">{me.companyName}</p>
              <p className="text-xs text-fg-subtle">{t("welcome", { name: me.name })}</p>
            </div>
          </div>
          <button onClick={logout} className="btn-secondary px-3 py-1.5 text-xs">
            {t("logout")}
          </button>
        </div>
        {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("projects")}</h2>
          {!assignments || assignments.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noProjects")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {assignments.map((a) => (
                <li key={a.id} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
                  <span className="font-medium text-fg">{a.project.name}</span>
                  {a.project.address && <span className="ml-2 text-xs text-fg-subtle">{a.project.address}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card mt-6">
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("punchListItems")}</h2>
          {!punchListItems || punchListItems.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noPunchListItems")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {punchListItems.map((item) => (
                <li key={item.id} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-fg">{item.title}</span>
                    <Badge tone={item.status === "verified" ? "success" : item.status === "resolved" ? "warning" : "neutral"}>
                      {t(`punchListStatus_${item.status}`)}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-fg-subtle">
                    <span>{item.project.name}</span>
                    {item.location && <span>{item.location}</span>}
                    {item.dueDate && <span>{formatDate(new Date(item.dueDate))}</span>}
                  </div>
                  {item.description && <p className="mt-1 text-xs text-fg-subtle">{item.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card mt-6">
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("costs")}</h2>
          {!costs || costs.length === 0 ? (
            <p className="mb-4 text-sm text-fg-subtle">{t("noCosts")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="mb-4 w-full border-collapse text-sm">
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-1.5">{c.description}</td>
                    <td className="text-fg-subtle">{c.project.name}</td>
                    <td>
                      <Badge tone={c.paid ? "success" : "neutral"}>
                        {c.paid ? t("paid") : t("unpaid")}
                      </Badge>
                    </td>
                    <td className="text-right font-medium">
                      {formatCurrency(c.amount, me.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {assignments && assignments.length > 0 && (
            <form onSubmit={submitCost} className="flex flex-wrap items-end gap-2 border-t border-gray-100 dark:border-gray-700 pt-4">
              <select aria-label={t("selectProject")}
                className="input w-auto"
                value={form.projectId}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
              >
                {assignments.map((a) => (
                  <option key={a.project.id} value={a.project.id}>
                    {a.project.name}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder={t("descriptionPlaceholder")} aria-label={t("descriptionPlaceholder")}
                className="input w-auto"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              <input
                required
                type="number"
                step="0.01"
                placeholder={t("amount")} aria-label={t("amount")}
                className="input w-28"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
              <button type="submit" disabled={busy} className="btn-primary">
                {t("submitCost")}
              </button>
            </form>
          )}
        </section>

        <section className="card mt-6">
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("bidRequests")}</h2>
          {!bidRequests || bidRequests.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noBidRequests")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {bidRequests.map((r) => {
                const myBid = r.bids[0];
                const form = bidForms[r.id] ?? { amount: "", notes: "" };
                return (
                  <li key={r.id} className="rounded-md border border-gray-200 dark:border-gray-700 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-fg">{r.title}</p>
                        <p className="text-xs text-fg-subtle">{r.project.name}</p>
                      </div>
                      <Badge tone={r.status === "open" ? "brand" : r.status === "awarded" && myBid?.isAwarded ? "success" : "neutral"}>
                        {r.status === "awarded" && myBid?.isAwarded ? t("youWon") : t(`bidStatus_${r.status}`)}
                      </Badge>
                    </div>
                    {r.description && <p className="mt-1.5 text-xs text-fg-subtle">{r.description}</p>}

                    {r.status === "open" ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="flex flex-wrap items-end gap-2">
                          <Field label={t("yourBidAmount")} size="sm">
                            <input
                              type="number"
                              step="0.01"
                              className="input w-28"
                              value={form.amount}
                              onChange={(e) => setBidForms((f) => ({ ...f, [r.id]: { ...form, amount: e.target.value } }))}
                            />
                          </Field>
                          <Field label={t("notes")} size="sm" className="flex-1">
                            <input
                              className="input"
                              value={form.notes}
                              onChange={(e) => setBidForms((f) => ({ ...f, [r.id]: { ...form, notes: e.target.value } }))}
                            />
                          </Field>
                          <button
                            onClick={() => submitBid(r.id)}
                            disabled={bidBusyId === r.id || !form.amount}
                            className="btn-primary px-3 py-1.5 text-xs"
                          >
                            {myBid ? t("updateBid") : t("submitBid")}
                          </button>
                        </div>
                        <Field label={t("scopeLinesLabel")} size="sm">
                          <textarea
                            rows={2}
                            className="input text-xs"
                            placeholder={t("scopeLinesPlaceholder")}
                            value={bidLinesText[r.id] ?? ""}
                            onChange={(e) => setBidLinesText((f) => ({ ...f, [r.id]: e.target.value }))}
                          />
                        </Field>
                      </div>
                    ) : (
                      myBid && (
                        <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                          {t("yourBidWas", { amount: formatCurrency(myBid.amount, me.currency) })}
                        </p>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card mt-6">
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("lienWaivers")}</h2>
          {!waivers || waivers.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noLienWaivers")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {waivers.map((w) => (
                <li key={w.id} className="rounded-md border border-gray-200 dark:border-gray-700 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-fg">{t(`lienWaiverType_${w.type}`)}</p>
                      <p className="text-xs text-fg-subtle">
                        {w.project.name} · {formatCurrency(w.amount, me.currency)}
                      </p>
                    </div>
                    <Badge tone={w.signedAt ? "success" : "warning"}>
                      {w.signedAt ? t("signed") : t("awaitingSignature")}
                    </Badge>
                  </div>

                  {!w.signedAt && signingId !== w.id && (
                    <button
                      onClick={() => {
                        setSigningId(w.id);
                        setSignerName("");
                        setSignatureDataUrl(null);
                      }}
                      className="btn-secondary mt-2 px-3 py-1 text-xs"
                    >
                      {t("signWaiver")}
                    </button>
                  )}

                  {signingId === w.id && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                      <Field label={t("signerNameLabel")} size="sm">
                        <input
                          className="input"
                          placeholder={t("signerNamePlaceholder")}
                          value={signerName}
                          onChange={(e) => setSignerName(e.target.value)}
                        />
                      </Field>
                      <SignaturePad onChange={setSignatureDataUrl} clearLabel={t("clearSignature")} />
                      <div className="flex gap-2">
                        <button
                          onClick={() => signWaiver(w.id)}
                          disabled={busy || !signerName.trim() || !signatureDataUrl}
                          className="btn-primary"
                        >
                          {t("confirmSignature")}
                        </button>
                        <button onClick={() => setSigningId(null)} className="btn-secondary">
                          {t("cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
