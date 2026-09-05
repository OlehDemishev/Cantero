"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  getSubcontractorPortalToken,
  subcontractorPortalApiFetch,
  clearSubcontractorPortalToken,
} from "@/lib/subcontractor-portal-api-client";
import { SignaturePad } from "@/components/signature-pad";
import { formatDate } from "@/lib/format-date";

interface Me {
  name: string;
  companyName: string;
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
    subcontractorPortalApiFetch<Cost[]>("/subcontractor-portal/costs").then(setCosts);
  }

  function loadWaivers() {
    subcontractorPortalApiFetch<LienWaiver[]>("/subcontractor-portal/lien-waivers").then(setWaivers);
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
    });
  }

  useEffect(() => {
    if (!getSubcontractorPortalToken()) {
      router.replace("/subcontractor-portal/login");
      return;
    }
    subcontractorPortalApiFetch<Me>("/subcontractor-portal/me").then(setMe);
    subcontractorPortalApiFetch<Assignment[]>("/subcontractor-portal/projects").then((list) => {
      setAssignments(list);
      if (list[0]) setForm((f) => ({ ...f, projectId: f.projectId || list[0].project.id }));
    });
    loadCosts();
    loadWaivers();
    loadBidRequests();
    subcontractorPortalApiFetch<MyPunchListItem[]>("/subcontractor-portal/punch-list-items").then(setPunchListItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    clearSubcontractorPortalToken();
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
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
              C
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{me.companyName}</p>
              <p className="text-xs text-gray-500">{t("welcome", { name: me.name })}</p>
            </div>
          </div>
          <button onClick={logout} className="btn-secondary px-3 py-1.5 text-xs">
            {t("logout")}
          </button>
        </div>
        {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("projects")}</h2>
          {!assignments || assignments.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noProjects")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {assignments.map((a) => (
                <li key={a.id} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
                  <span className="font-medium text-gray-900">{a.project.name}</span>
                  {a.project.address && <span className="ml-2 text-xs text-gray-400">{a.project.address}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("punchListItems")}</h2>
          {!punchListItems || punchListItems.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noPunchListItems")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {punchListItems.map((item) => (
                <li key={item.id} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{item.title}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.status === "verified"
                          ? "bg-success-50 text-success-700"
                          : item.status === "resolved"
                            ? "bg-warning-50 text-warning-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {t(`punchListStatus_${item.status}`)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-400">
                    <span>{item.project.name}</span>
                    {item.location && <span>{item.location}</span>}
                    {item.dueDate && <span>{formatDate(new Date(item.dueDate))}</span>}
                  </div>
                  {item.description && <p className="mt-1 text-xs text-gray-500">{item.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("costs")}</h2>
          {!costs || costs.length === 0 ? (
            <p className="mb-4 text-sm text-gray-400">{t("noCosts")}</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="mb-4 w-full border-collapse text-sm">
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="py-1.5">{c.description}</td>
                    <td className="text-gray-500">{c.project.name}</td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.paid ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {c.paid ? t("paid") : t("unpaid")}
                      </span>
                    </td>
                    <td className="text-right font-medium">
                      {c.amount} {me.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {assignments && assignments.length > 0 && (
            <form onSubmit={submitCost} className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
              <select
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
                placeholder={t("descriptionPlaceholder")}
                className="input w-auto"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              <input
                required
                type="number"
                step="0.01"
                placeholder={t("amount")}
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
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("bidRequests")}</h2>
          {!bidRequests || bidRequests.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noBidRequests")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {bidRequests.map((r) => {
                const myBid = r.bids[0];
                const form = bidForms[r.id] ?? { amount: "", notes: "" };
                return (
                  <li key={r.id} className="rounded-md border border-gray-200 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{r.title}</p>
                        <p className="text-xs text-gray-500">{r.project.name}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "open"
                            ? "bg-brand-50 text-brand-700"
                            : r.status === "awarded" && myBid?.isAwarded
                              ? "bg-success-50 text-success-700"
                              : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {r.status === "awarded" && myBid?.isAwarded ? t("youWon") : t(`bidStatus_${r.status}`)}
                      </span>
                    </div>
                    {r.description && <p className="mt-1.5 text-xs text-gray-500">{r.description}</p>}

                    {r.status === "open" ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="flex flex-col gap-1 text-xs text-gray-500">
                            {t("yourBidAmount")}
                            <input
                              type="number"
                              step="0.01"
                              className="input w-28"
                              value={form.amount}
                              onChange={(e) => setBidForms((f) => ({ ...f, [r.id]: { ...form, amount: e.target.value } }))}
                            />
                          </label>
                          <label className="flex flex-1 flex-col gap-1 text-xs text-gray-500">
                            {t("notes")}
                            <input
                              className="input"
                              value={form.notes}
                              onChange={(e) => setBidForms((f) => ({ ...f, [r.id]: { ...form, notes: e.target.value } }))}
                            />
                          </label>
                          <button
                            onClick={() => submitBid(r.id)}
                            disabled={bidBusyId === r.id || !form.amount}
                            className="btn-primary px-3 py-1.5 text-xs"
                          >
                            {myBid ? t("updateBid") : t("submitBid")}
                          </button>
                        </div>
                        <label className="flex flex-col gap-1 text-xs text-gray-500">
                          {t("scopeLinesLabel")}
                          <textarea
                            rows={2}
                            className="input text-xs"
                            placeholder={t("scopeLinesPlaceholder")}
                            value={bidLinesText[r.id] ?? ""}
                            onChange={(e) => setBidLinesText((f) => ({ ...f, [r.id]: e.target.value }))}
                          />
                        </label>
                      </div>
                    ) : (
                      myBid && (
                        <p className="mt-2 text-xs text-gray-600">
                          {t("yourBidWas", { amount: myBid.amount, currency: me.currency })}
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
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("lienWaivers")}</h2>
          {!waivers || waivers.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noLienWaivers")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {waivers.map((w) => (
                <li key={w.id} className="rounded-md border border-gray-200 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{t(`lienWaiverType_${w.type}`)}</p>
                      <p className="text-xs text-gray-500">
                        {w.project.name} · {w.amount} {me.currency}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        w.signedAt ? "bg-success-50 text-success-700" : "bg-warning-50 text-warning-700"
                      }`}
                    >
                      {w.signedAt ? t("signed") : t("awaitingSignature")}
                    </span>
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
                    <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
                      <label className="flex flex-col gap-1 text-xs text-gray-500">
                        {t("signerNameLabel")}
                        <input
                          className="input"
                          placeholder={t("signerNamePlaceholder")}
                          value={signerName}
                          onChange={(e) => setSignerName(e.target.value)}
                        />
                      </label>
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
