"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError, apiFetch, downloadBlob } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";
import { useCan } from "@/lib/permissions";

interface GobdLedgerEntry {
  id: string;
  sequence: number;
  entityType: string;
  entityId: string;
  event: string;
  summary: string;
  actorName: string;
  createdAt: string;
}

interface GobdVerification {
  valid: boolean;
  /** The hash chain alone; `valid` also needs every outside timestamp to hold. */
  chainValid: boolean;
  brokenAtSequence: number | null;
  entryCount: number;
  anchoring: { valid: boolean; anchorCount: number; brokenAtSequence: number | null };
}

interface GobdAnchor {
  id: string;
  sequence: number;
  tsaUrl: string;
  timestampedAt: string;
}

const ANCHORS_SHOWN = 5;

const LEDGER_PAGE_SIZE = 100;

export function GobdCompliancePanel() {
  const t = useTranslations("gobd");
  const tc = useTranslations("common");

  const [ledger, setLedger] = useState<GobdLedgerEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [verification, setVerification] = useState<GobdVerification | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const canManage = useCan()("finance.manage");
  const [anchoring, setAnchoring] = useState<{ enabled: boolean; anchors: GobdAnchor[] } | null>(null);
  const [anchorBusy, setAnchorBusy] = useState(false);
  const [anchorMessage, setAnchorMessage] = useState<string | null>(null);

  function load() {
    apiFetch<GobdLedgerEntry[]>("/company/gobd/ledger").then((page) => {
      setLedger(page);
      setHasMore(page.length === LEDGER_PAGE_SIZE);
    });
  }

  function loadAnchors() {
    apiFetch<{ enabled: boolean; anchors: GobdAnchor[] }>("/company/gobd/anchors").then(setAnchoring);
  }

  useEffect(() => {
    load();
    loadAnchors();
  }, []);

  async function anchorNow() {
    setAnchorBusy(true);
    setAnchorMessage(null);
    try {
      const { anchor } = await apiFetch<{ anchor: GobdAnchor | null }>("/company/gobd/anchors", { method: "POST" });
      setAnchorMessage(anchor ? t("anchorDone") : t("anchorUpToDate"));
      loadAnchors();
    } catch (err) {
      // An API refusal is already shown as a notice by apiFetch; only a lost connection isn't.
      if (!(err instanceof ApiError)) setAnchorMessage(t("anchorFailed"));
    } finally {
      setAnchorBusy(false);
    }
  }

  async function downloadToken(anchor: GobdAnchor) {
    const blob = await apiFetch<Blob>(`/company/gobd/anchors/${anchor.id}/token.tsr`);
    downloadBlob(blob, `gobd-ledger-${anchor.sequence}.tsr`);
  }

  async function loadMore() {
    if (!ledger || ledger.length === 0) return;
    setLoadMoreBusy(true);
    try {
      const page = await apiFetch<GobdLedgerEntry[]>(`/company/gobd/ledger?cursor=${ledger[ledger.length - 1].id}`);
      setLedger([...ledger, ...page]);
      setHasMore(page.length === LEDGER_PAGE_SIZE);
    } finally {
      setLoadMoreBusy(false);
    }
  }

  async function verify() {
    setVerifyBusy(true);
    try {
      setVerification(await apiFetch<GobdVerification>("/company/gobd/verify"));
    } finally {
      setVerifyBusy(false);
    }
  }

  async function downloadDoc() {
    setDocBusy(true);
    try {
      const blob = await apiFetch<Blob>("/company/gobd/verfahrensdokumentation.pdf");
      downloadBlob(blob, "Verfahrensdokumentation-GoBD.pdf");
    } finally {
      setDocBusy(false);
    }
  }

  return (
    <section className="card lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={downloadDoc} disabled={docBusy} className="btn-secondary px-2.5 py-1.5 text-xs">
          {t("downloadDocumentation")}
        </button>
        <button onClick={verify} disabled={verifyBusy} className="btn-secondary px-2.5 py-1.5 text-xs">
          {t("verifyChain")}
        </button>
        {verification &&
          (verification.valid ? (
            <span className="rounded-full bg-success-50 dark:bg-success-500/15 px-2.5 py-1 text-xs font-medium text-success-700 dark:text-success-500">
              {t("chainValid", { count: verification.entryCount })}
              {verification.anchoring.anchorCount > 0 && ` · ${t("anchorsConfirm", { count: verification.anchoring.anchorCount })}`}
            </span>
          ) : (
            <span className="rounded-full bg-error-50 dark:bg-error-500/15 px-2.5 py-1 text-xs font-medium text-error-700 dark:text-error-500">
              {verification.chainValid
                ? t("anchorBroken", { sequence: verification.anchoring.brokenAtSequence ?? 0 })
                : t("chainBroken", { sequence: verification.brokenAtSequence ?? 0 })}
            </span>
          ))}
      </div>

      {anchoring && (
        <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200">{t("anchorsTitle")}</h3>
            {anchoring.enabled && canManage && (
              <button onClick={anchorNow} disabled={anchorBusy} className="btn-secondary px-2.5 py-1 text-xs">
                {t("anchorNow")}
              </button>
            )}
          </div>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{anchoring.enabled ? t("anchorsHint") : t("anchorsOff")}</p>
          {anchorMessage && <p className="mb-2 text-xs text-gray-600 dark:text-gray-300">{anchorMessage}</p>}
          {anchoring.anchors.length === 0 ? (
            anchoring.enabled && <p className="text-xs text-gray-400 dark:text-gray-500">{t("anchorsNone")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {anchoring.anchors.slice(0, ANCHORS_SHOWN).map((anchor) => (
                <li key={anchor.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-gray-600 dark:text-gray-300">
                    <span className="font-mono text-gray-400 dark:text-gray-500">#{anchor.sequence}</span>{" "}
                    {formatDateTime(new Date(anchor.timestampedAt))} · {new URL(anchor.tsaUrl).hostname}
                  </span>
                  <button onClick={() => downloadToken(anchor)} className="shrink-0 text-brand-700 dark:text-brand-400 hover:underline">
                    {t("downloadToken")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!ledger ? (
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : ledger.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noEntries")}</p>
      ) : (
        <>
          <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {ledger.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between border-b border-gray-100 dark:border-gray-700 pb-2 text-sm">
                <div>
                  <span className="font-mono text-xs text-gray-400 dark:text-gray-500">#{entry.sequence}</span>{" "}
                  <span className="font-medium text-gray-800 dark:text-gray-100">{entry.actorName}</span>{" "}
                  <span className="text-gray-600 dark:text-gray-300">{entry.summary}</span>
                </div>
                <span className="shrink-0 pl-3 text-xs text-gray-400 dark:text-gray-500">{formatDateTime(new Date(entry.createdAt))}</span>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button onClick={loadMore} disabled={loadMoreBusy} className="btn-secondary mt-3 px-2.5 py-1 text-xs">
              {tc("loadMore")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
