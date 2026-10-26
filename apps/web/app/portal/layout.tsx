"use client";

import { LocaleFromSession, PublicLocaleProvider } from "@/components/public-locale";
import { getPortalToken, portalApiFetch } from "@/lib/portal-api-client";

const loadMe = () => (getPortalToken() ? portalApiFetch<{ locale: string }>("/portal/me") : Promise.resolve(null));

/** The client portal opens in the language this client gets its documents in (components/public-locale.tsx). */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicLocaleProvider>
      <LocaleFromSession load={loadMe} />
      {children}
    </PublicLocaleProvider>
  );
}
