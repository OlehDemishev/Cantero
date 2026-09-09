"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { LoanStatus } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";

interface Equipment {
  id: string;
  name: string;
}
interface Loan {
  id: string;
  lenderName: string;
  principal: string;
  interestRatePercent: string;
  termMonths: number;
  startDate: string;
  status: LoanStatus;
  equipment: Equipment | null;
}
interface LoanPayment {
  id: string;
  dueDate: string;
  principalPortion: string;
  interestPortion: string;
  paidAt: string | null;
  paidAmount: string | null;
}
interface LoanDetail extends Loan {
  payments: LoanPayment[];
}
interface DebtServiceSummary {
  activeLoanCount: number;
  outstandingPrincipal: number;
  upcomingDebtService: number;
  monthsAhead: number;
}

const STATUS_STYLES: Record<LoanStatus, string> = {
  active: "bg-brand-50 text-brand-700",
  paid_off: "bg-success-50 text-success-700",
  defaulted: "bg-error-50 text-error-700",
};

export default function LoansPage() {
  const t = useTranslations("loans");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [summary, setSummary] = useState<DebtServiceSummary | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LoanDetail | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ equipmentId: "", lenderName: "", principal: "", interestRatePercent: "", termMonths: "", startDate: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Loan[]>("/loans").then(setLoans);
    apiFetch<DebtServiceSummary>("/loans/debt-service-summary").then(setSummary);
  }
  useEffect(load, []);
  useEffect(() => {
    apiFetch<Equipment[]>("/equipment").then(setEquipment);
  }, []);

  async function createLoan(e: React.FormEvent) {
    e.preventDefault();
    if (!form.lenderName.trim() || !form.principal || !form.termMonths || !form.startDate) return;
    setBusy(true);
    try {
      await apiFetch("/loans", {
        method: "POST",
        body: JSON.stringify({
          equipmentId: form.equipmentId || undefined,
          lenderName: form.lenderName.trim(),
          principal: Number(form.principal),
          interestRatePercent: Number(form.interestRatePercent || 0),
          termMonths: Number(form.termMonths),
          startDate: new Date(form.startDate).toISOString(),
        }),
      });
      setForm({ equipmentId: "", lenderName: "", principal: "", interestRatePercent: "", termMonths: "", startDate: "" });
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    const d = await apiFetch<LoanDetail>(`/loans/${id}`);
    setDetail(d);
  }

  async function recordPayment(loanId: string, paymentId: string, principalPortion: string, interestPortion: string) {
    setBusy(true);
    try {
      await apiFetch(`/loans/payments/${paymentId}/record`, {
        method: "POST",
        body: JSON.stringify({ paidAmount: Number(principalPortion) + Number(interestPortion) }),
      });
      const d = await apiFetch<LoanDetail>(`/loans/${loanId}`);
      setDetail(d);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary px-3 py-1.5 text-sm">
            {t("addLoan")}
          </button>
        )}
      </div>

      {summary && summary.activeLoanCount > 0 && (
        <div className="card mt-4 grid grid-cols-3 gap-3 max-w-lg">
          <div>
            <div className="text-xs text-gray-500">{t("activeLoans")}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{summary.activeLoanCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t("outstandingPrincipal")}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              {summary.outstandingPrincipal} {currency}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t("upcomingDebtService", { months: summary.monthsAhead })}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              {summary.upcomingDebtService} {currency}
            </div>
          </div>
        </div>
      )}

      {adding && (
        <form onSubmit={createLoan} className="card mt-4 flex max-w-lg flex-col gap-2">
          <input
            required
            placeholder={t("lenderNamePlaceholder")}
            className="input"
            value={form.lenderName}
            onChange={(e) => setForm((f) => ({ ...f, lenderName: e.target.value }))}
          />
          <select className="input" value={form.equipmentId} onChange={(e) => setForm((f) => ({ ...f, equipmentId: e.target.value }))}>
            <option value="">{t("noLinkedEquipment")}</option>
            {equipment.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <input
              required
              type="number"
              step="0.01"
              min="0"
              placeholder={t("principalPlaceholder", { currency })}
              className="input w-40"
              value={form.principal}
              onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder={t("interestRatePlaceholder")}
              className="input w-32"
              value={form.interestRatePercent}
              onChange={(e) => setForm((f) => ({ ...f, interestRatePercent: e.target.value }))}
            />
            <input
              required
              type="number"
              min="1"
              placeholder={t("termMonthsPlaceholder")}
              className="input w-32"
              value={form.termMonths}
              onChange={(e) => setForm((f) => ({ ...f, termMonths: e.target.value }))}
            />
          </div>
          <label className="text-xs text-gray-500">
            {t("startDate")}
            <input required type="date" className="input mt-1" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        {!loans ? (
          <p className="text-gray-500">{tc("loading")}</p>
        ) : loans.length === 0 ? (
          <p className="text-gray-500">{t("noLoans")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {loans.map((loan) => {
              const expanded = expandedId === loan.id;
              return (
                <li key={loan.id} className="card">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(loan.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggleExpand(loan.id)}
                    className="flex w-full cursor-pointer items-center justify-between text-left"
                  >
                    <span className="text-sm font-medium text-gray-900">
                      {loan.lenderName}
                      {loan.equipment && (
                        <Link
                          href={`/equipment/${loan.equipment.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-1.5 text-xs text-brand-700 hover:underline"
                        >
                          ({loan.equipment.name})
                        </Link>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {loan.principal} {currency} · {loan.interestRatePercent}% · {loan.termMonths}mo
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[loan.status]}`}>{t(`status_${loan.status}`)}</span>
                    </div>
                  </div>

                  {expanded && detail && detail.id === loan.id && (
                    <div className="mt-3 overflow-x-auto border-t border-gray-100 pt-3">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-left text-gray-500">
                            <th className="py-1.5">{t("dueDate")}</th>
                            <th>{t("principalPortion")}</th>
                            <th>{t("interestPortion")}</th>
                            <th>{tc("status")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.payments.map((p) => (
                            <tr key={p.id} className="border-b border-gray-100">
                              <td className="py-1.5">{formatDate(new Date(p.dueDate))}</td>
                              <td>
                                {p.principalPortion} {currency}
                              </td>
                              <td>
                                {p.interestPortion} {currency}
                              </td>
                              <td>
                                {p.paidAt ? (
                                  <span className="text-success-700">{t("paidOn", { date: formatDate(new Date(p.paidAt)) })}</span>
                                ) : (
                                  <button
                                    onClick={() => recordPayment(loan.id, p.id, p.principalPortion, p.interestPortion)}
                                    disabled={busy}
                                    className="btn-secondary px-2 py-1 text-xs"
                                  >
                                    {t("recordPayment")}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AuthenticatedShell>
  );
}
