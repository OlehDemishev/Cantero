"use client";

import { LocaleFromSession, PublicLocaleProvider } from "@/components/public-locale";
import { getSupplierPortalToken, supplierPortalApiFetch } from "@/lib/supplier-portal-api-client";

const loadMe = () => (getSupplierPortalToken() ? supplierPortalApiFetch<{ locale: string }>("/supplier-portal/me") : Promise.resolve(null));

/** The supplier portal opens in the company's language (components/public-locale.tsx). */
export default function SupplierPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicLocaleProvider>
      <LocaleFromSession load={loadMe} />
      {children}
    </PublicLocaleProvider>
  );
}
