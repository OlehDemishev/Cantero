"use client";

import { LocaleFromSession, PublicLocaleProvider } from "@/components/public-locale";
import { getSubcontractorPortalToken, subcontractorPortalApiFetch } from "@/lib/subcontractor-portal-api-client";

const loadMe = () =>
  getSubcontractorPortalToken() ? subcontractorPortalApiFetch<{ locale: string }>("/subcontractor-portal/me") : Promise.resolve(null);

/** The subcontractor portal opens in the company's language (components/public-locale.tsx). */
export default function SubcontractorPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicLocaleProvider>
      <LocaleFromSession load={loadMe} />
      {children}
    </PublicLocaleProvider>
  );
}
