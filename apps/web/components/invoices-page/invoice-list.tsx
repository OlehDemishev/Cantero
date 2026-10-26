"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoicesIcon } from "@/components/nav-icons";
import { apiFetch } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format-currency";
import type { Invoice } from "./types";

const INVOICES_PAGE_SIZE = 100;

/** The company's invoices, a page at a time; loaded again whenever `version` moves on. */
export function InvoiceList({ currency, version }: { currency: string; version: number }) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [invoicesError, setInvoicesError] = useState<Error | null>(null);
  const [invoicesHasMore, setInvoicesHasMore] = useState(false);
  const [invoicesLoadMoreBusy, setInvoicesLoadMoreBusy] = useState(false);

  function loadInvoices() {
    apiFetch<Invoice[]>("/invoices")
      .then((page) => {
        setInvoicesError(null);
        setInvoices(page);
        setInvoicesHasMore(page.length === INVOICES_PAGE_SIZE);
      })
      .catch(setInvoicesError);
  }

  async function loadMoreInvoices() {
    if (!invoices || invoices.length === 0) return;
    setInvoicesLoadMoreBusy(true);
    try {
      const page = await apiFetch<Invoice[]>(
        `/invoices?cursor=${invoices[invoices.length - 1].id}`,
      );
      setInvoices([...invoices, ...page]);
      setInvoicesHasMore(page.length === INVOICES_PAGE_SIZE);
    } finally {
      setInvoicesLoadMoreBusy(false);
    }
  }

  useEffect(() => {
    loadInvoices();
  }, [version]);

  return (
    <div className="mt-6">
      {!invoices ? (
        invoicesError ? <ErrorState error={invoicesError} onRetry={loadInvoices} compact /> : <Skeleton variant="table" rows={5} columns={5} />
      ) : invoices.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={InvoicesIcon}
            title={t("emptyTitle")}
            message={t("empty")}
            cta={{ label: t("emptyCta"), href: "/projects" }}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th scope="col" className="py-2">{t("number")}</th>
                <th scope="col">{tc("name")}</th>
                <th scope="col">{tc("status")}</th>
                <th scope="col">{t("total")}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="cursor-pointer border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <td className="py-2">
                    <a href={`/invoices/${inv.id}`} className="block">
                      {inv.number}
                    </a>
                  </td>
                  <td>
                    <Link
                      href={`/clients/${inv.client.id}`}
                      className="text-brand-700 dark:text-brand-400 hover:underline"
                    >
                      {inv.client.name}
                    </Link>{" "}
                    ·{" "}
                    <Link
                      href={`/projects/${inv.project.id}`}
                      className="text-brand-700 dark:text-brand-400 hover:underline"
                    >
                      {inv.project.name}
                    </Link>
                  </td>
                  <td>{t(inv.status)}</td>
                  <td>
                    {formatCurrency(inv.total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoicesHasMore && (
            <button
              onClick={loadMoreInvoices}
              disabled={invoicesLoadMoreBusy}
              className="btn-secondary mt-3 px-2.5 py-1.5 text-xs"
            >
              {tc("loadMore")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
