"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError } from "@/lib/api-client";

interface PublicProfile {
  name: string;
  specialization: string | null;
  bio: string | null;
  referencedBy: string;
  projectsWorked: number;
  totalPaidOut: number;
}

export default function SubcontractorPublicProfilePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("subcontractorCompliance");
  const tc = useTranslations("common");

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PublicProfile>(`/public/subcontractor-profiles/${token}`)
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("profileNotFound")));
  }, [token, t]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-gray-50 dark:bg-gray-700 px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="card">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{profile.name}</h1>
          {profile.specialization && <p className="mt-1 text-sm text-brand-600">{profile.specialization}</p>}
          {profile.bio && <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{profile.bio}</p>}

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-100 dark:border-gray-700 pt-4">
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t("projectsWorked")}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">{profile.projectsWorked}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t("totalPaidOut")}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">{profile.totalPaidOut.toLocaleString()}</p>
            </div>
          </div>

          <p className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4 text-xs text-gray-400 dark:text-gray-500">{t("referencedBy", { name: profile.referencedBy })}</p>
        </div>
      </div>
    </main>
  );
}
