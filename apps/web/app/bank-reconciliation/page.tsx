"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CsvImportButton } from "@/components/csv-import-button";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: string;
  reconciled: boolean;
  matchedInvoice: { id: string; number: string } | null;
  matchedExpense: { id: string; description: string } | null;
}
interface Invoice {
  id: string;
  number: string;
}
interface Expense {
  id: string;
  description: string;
}

type MatchTarget = "invoice" | "expense";

export default function BankReconciliationPage() {
  const t = useTranslations("bankReconciliation");
  const tc = useTranslations("common");
  const ti = useTranslations("import");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [transactions, setTransactions] = useState<BankTransaction[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filter, setFilter] = useState<"all" | "unreconciled">("unreconciled");
  const [matchDrafts, setMatchDrafts] = useState<Record<string, { target: MatchTarget; id: string }>>({});
  const [busy, setBusy] = useState(false);

  function load() {
    const query = filter === "unreconciled" ? "?reconciled=false" : "";
    apiFetch<BankTransaction[]>(`/bank-transactions${query}`).then(setTransactions);
  }

  useEffect(load, [filter]);
  useEffect(() => {
    apiFetch<Invoice[]>("/invoices").then(setInvoices);
    apiFetch<Expense[]>("/expenses").then(setExpenses);
  }, []);

  function draftFor(txId: string): { target: MatchTarget; id: string } {
    return matchDrafts[txId] ?? { target: "invoice", id: invoices[0]?.id ?? "" };
  }

  function setDraft(txId: string, draft: { target: MatchTarget; id: string }) {
    setMatchDrafts((d) => ({ ...d, [txId]: draft }));
  }

  async function match(txId: string) {
    const draft = draftFor(txId);
    if (!draft.id) return;
    setBusy(true);
    try {
      await apiFetch(`/bank-transactions/${txId}/match`, {
        method: "POST",
        body: JSON.stringify(draft.target === "invoice" ? { invoiceId: draft.id } : { expenseId: draft.id }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function unmatch(txId: string) {
    setBusy(true);
    try {
      await apiFetch(`/bank-transactions/${txId}/unmatch`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthenticatedShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <CsvImportButton endpoint="/bank-transactions/import" label={ti("importBankTransactions")} onDone={load} />
      </div>
      <p className="mt-2 text-sm text-gray-500">{t("hint")}</p>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setFilter("unreconciled")}
          className={filter === "unreconciled" ? "btn-primary px-3 py-1 text-xs" : "btn-secondary px-3 py-1 text-xs"}
        >
          {t("unreconciled")}
        </button>
        <button
          onClick={() => setFilter("all")}
          className={filter === "all" ? "btn-primary px-3 py-1 text-xs" : "btn-secondary px-3 py-1 text-xs"}
        >
          {t("all")}
        </button>
      </div>

      {!transactions ? (
        <p className="mt-6 text-gray-500">{tc("loading")}</p>
      ) : transactions.length === 0 ? (
        <p className="mt-6 text-sm text-gray-400">{t("noTransactions")}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {transactions.map((tx) => {
            const draft = draftFor(tx.id);
            return (
              <li key={tx.id} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{tx.description}</div>
                    <div className="text-xs text-gray-500">{new Date(tx.date).toLocaleDateString()}</div>
                  </div>
                  <div className={`text-sm font-semibold ${Number(tx.amount) < 0 ? "text-error-700" : "text-success-700"}`}>
                    {tx.amount} {currency}
                  </div>
                </div>

                {tx.reconciled ? (
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {t("matchedTo")}{" "}
                      {tx.matchedInvoice ? tx.matchedInvoice.number : tx.matchedExpense ? tx.matchedExpense.description : "—"}
                    </span>
                    <button onClick={() => unmatch(tx.id)} disabled={busy} className="text-error-700 hover:underline">
                      {t("unmatch")}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      className="input w-auto text-xs"
                      value={draft.target}
                      onChange={(e) => {
                        const target = e.target.value as MatchTarget;
                        const id = target === "invoice" ? invoices[0]?.id ?? "" : expenses[0]?.id ?? "";
                        setDraft(tx.id, { target, id });
                      }}
                    >
                      <option value="invoice">{t("invoice")}</option>
                      <option value="expense">{t("expense")}</option>
                    </select>
                    <select
                      className="input w-auto text-xs"
                      value={draft.id}
                      onChange={(e) => setDraft(tx.id, { ...draft, id: e.target.value })}
                    >
                      {(draft.target === "invoice" ? invoices : expenses).map((item) => (
                        <option key={item.id} value={item.id}>
                          {"number" in item ? item.number : item.description}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => match(tx.id)} disabled={busy || !draft.id} className="btn-secondary px-3 py-1 text-xs">
                      {t("match")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AuthenticatedShell>
  );
}
