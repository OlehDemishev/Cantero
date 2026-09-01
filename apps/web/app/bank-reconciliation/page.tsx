"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@cantero/shared";
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
  category: ExpenseCategory | null;
  matchedInvoice: { id: string; number: string } | null;
  matchedExpense: { id: string; description: string } | null;
}
interface BankTransactionRule {
  id: string;
  pattern: string;
  category: ExpenseCategory;
}
interface Invoice {
  id: string;
  number: string;
}
interface Expense {
  id: string;
  description: string;
}
interface MatchCandidate {
  type: MatchTarget;
  id: string;
  label: string;
  amount: number;
  daysApart: number;
  exact: boolean;
}
interface MatchSuggestion {
  transactionId: string;
  candidates: MatchCandidate[];
}

type MatchTarget = "invoice" | "expense";

export default function BankReconciliationPage() {
  const t = useTranslations("bankReconciliation");
  const tc = useTranslations("common");
  const ti = useTranslations("import");
  const te = useTranslations("expenses");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [transactions, setTransactions] = useState<BankTransaction[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [rules, setRules] = useState<BankTransactionRule[] | null>(null);
  const [ruleForm, setRuleForm] = useState<{ pattern: string; category: ExpenseCategory }>({ pattern: "", category: "other" });
  const [showRules, setShowRules] = useState(false);
  const [filter, setFilter] = useState<"all" | "unreconciled">("unreconciled");
  const [matchDrafts, setMatchDrafts] = useState<Record<string, { target: MatchTarget; id: string }>>({});
  const [suggestions, setSuggestions] = useState<Record<string, MatchCandidate[]>>({});
  const [busy, setBusy] = useState(false);
  const [applyResult, setApplyResult] = useState<{ categorized: number } | null>(null);

  function load() {
    const query = filter === "unreconciled" ? "?reconciled=false" : "";
    apiFetch<BankTransaction[]>(`/bank-transactions${query}`).then(setTransactions);
    apiFetch<MatchSuggestion[]>("/bank-transactions/suggested-matches").then((list) =>
      setSuggestions(Object.fromEntries(list.map((s) => [s.transactionId, s.candidates]))),
    );
  }

  function loadRules() {
    apiFetch<BankTransactionRule[]>("/bank-transactions/rules").then(setRules);
  }

  useEffect(load, [filter]);
  useEffect(() => {
    apiFetch<Invoice[]>("/invoices").then(setInvoices);
    apiFetch<Expense[]>("/expenses").then(setExpenses);
    loadRules();
  }, []);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    if (!ruleForm.pattern.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/bank-transactions/rules", { method: "POST", body: JSON.stringify(ruleForm) });
      setRuleForm({ pattern: "", category: "other" });
      loadRules();
    } finally {
      setBusy(false);
    }
  }

  async function deleteRule(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/bank-transactions/rules/${id}`, { method: "DELETE" });
      loadRules();
    } finally {
      setBusy(false);
    }
  }

  async function applyRules() {
    setBusy(true);
    setApplyResult(null);
    try {
      const result = await apiFetch<{ categorized: number }>("/bank-transactions/apply-rules", { method: "POST" });
      setApplyResult(result);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function setCategory(txId: string, category: ExpenseCategory | "") {
    setBusy(true);
    try {
      await apiFetch(`/bank-transactions/${txId}/category`, { method: "POST", body: JSON.stringify({ category: category || null }) });
      load();
    } finally {
      setBusy(false);
    }
  }

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

  async function matchSuggested(txId: string, candidate: MatchCandidate) {
    setBusy(true);
    try {
      await apiFetch(`/bank-transactions/${txId}/match`, {
        method: "POST",
        body: JSON.stringify(candidate.type === "invoice" ? { invoiceId: candidate.id } : { expenseId: candidate.id }),
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
        <div className="flex items-center gap-2">
          <button onClick={() => setShowRules((v) => !v)} className="btn-secondary px-3 py-1 text-xs">
            {t("categorizationRules")}
          </button>
          <CsvImportButton endpoint="/bank-transactions/import" label={ti("importBankTransactions")} onDone={load} />
        </div>
      </div>
      <p className="mt-2 text-sm text-gray-500">{t("hint")}</p>

      {showRules && (
        <div className="card mt-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">{t("categorizationRules")}</h2>
            <div className="flex items-center gap-2">
              <button onClick={applyRules} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
                {t("applyRulesNow")}
              </button>
              {applyResult && <span className="text-xs text-success-700">{t("applyRulesResult", { count: applyResult.categorized })}</span>}
            </div>
          </div>
          <p className="mb-3 text-xs text-gray-500">{t("categorizationRulesHint")}</p>

          <form onSubmit={createRule} className="flex flex-wrap items-end gap-2">
            <input
              className="input flex-1"
              placeholder={t("rulePatternPlaceholder")}
              value={ruleForm.pattern}
              onChange={(e) => setRuleForm((f) => ({ ...f, pattern: e.target.value }))}
            />
            <select
              className="input w-auto"
              value={ruleForm.category}
              onChange={(e) => setRuleForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {te(c)}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busy || !ruleForm.pattern.trim()} className="btn-primary px-3 py-1 text-xs">
              {t("addRule")}
            </button>
          </form>

          {rules && rules.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700">
                    &ldquo;{r.pattern}&rdquo; → <span className="font-medium">{te(r.category)}</span>
                  </span>
                  <button onClick={() => deleteRule(r.id)} disabled={busy} className="text-error-600 hover:underline">
                    {tc("delete")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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

                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-xs text-gray-400">{t("category")}</span>
                  <select
                    className="input w-auto py-0.5 text-xs"
                    value={tx.category ?? ""}
                    onChange={(e) => setCategory(tx.id, e.target.value as ExpenseCategory | "")}
                  >
                    <option value="">{t("uncategorized")}</option>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {te(c)}
                      </option>
                    ))}
                  </select>
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
                  <div className="mt-2 flex flex-col gap-2">
                    {(suggestions[tx.id] ?? []).length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-2.5 py-1.5">
                        <span className="text-xs font-medium text-brand-700">{t("suggestedMatch")}</span>
                        {(suggestions[tx.id] ?? []).map((c) => (
                          <button
                            key={`${c.type}-${c.id}`}
                            onClick={() => matchSuggested(tx.id, c)}
                            disabled={busy}
                            className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-brand-700 shadow-theme-xs hover:bg-brand-100"
                          >
                            {c.label} {c.exact ? "" : `(${t("approxMatch")})`}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
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
