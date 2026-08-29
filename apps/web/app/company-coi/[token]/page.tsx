"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CompanyDocumentType } from "@cantero/shared";
import { apiFetch, ApiError, downloadBlob } from "@/lib/api-client";

interface PublicCoiDocument {
  id: string;
  type: CompanyDocumentType;
  name: string;
  expiresAt: string;
  fileDocumentId: string | null;
  fileName: string | null;
}
interface PublicCoi {
  companyName: string;
  documents: PublicCoiDocument[];
}

export default function CompanyCoiPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("companyCoi");
  const tc = useTranslations("common");

  const [coi, setCoi] = useState<PublicCoi | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PublicCoi>(`/public/company-coi/${token}`)
      .then(setCoi)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("notFound")));
  }, [token, t]);

  async function download(doc: PublicCoiDocument) {
    if (!doc.fileDocumentId) return;
    const blob = await apiFetch<Blob>(`/public/company-coi/${token}/documents/${doc.fileDocumentId}/download`);
    downloadBlob(blob, doc.fileName ?? doc.name);
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{error}</p>
      </main>
    );
  }

  if (!coi) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{tc("loading")}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="card">
          <h1 className="text-xl font-semibold text-gray-900">{coi.companyName}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("publicSubtitle")}</p>

          {coi.documents.length === 0 ? (
            <p className="mt-5 border-t border-gray-100 pt-4 text-sm text-gray-400">{t("noCurrentDocuments")}</p>
          ) : (
            <ul className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-4">
              {coi.documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-medium text-gray-900">{t(doc.type)}</span>
                    <span className="text-gray-500"> — {doc.name}</span>
                    <br />
                    <span className="text-xs text-gray-400">{t("validUntil", { date: new Date(doc.expiresAt).toLocaleDateString() })}</span>
                  </span>
                  {doc.fileDocumentId && (
                    <button onClick={() => download(doc)} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
                      {t("download")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
