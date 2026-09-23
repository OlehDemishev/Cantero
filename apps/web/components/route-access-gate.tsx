"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Permission } from "@cantero/shared";
import { useMe } from "@/lib/use-me";
import { permissionsFor } from "@/lib/route-access";
import { AuthenticatedShell } from "@/components/authenticated-shell";

/**
 * Stands in front of every page (root layout). A page that needs a permission the member lacks is not
 * mounted at all — none of its requests go out — and the "no access" screen shows in its place, inside
 * the usual menu. Pages open to everyone, and public ones, pass straight through.
 */
export function RouteAccessGate({ children }: { children: React.ReactNode }) {
  const needs = permissionsFor(usePathname());
  if (!needs) return <>{children}</>;
  return <RestrictedPage needs={needs}>{children}</RestrictedPage>;
}

function RestrictedPage({ needs, children }: { needs: readonly Permission[]; children: React.ReactNode }) {
  const { data, loading } = useMe();
  // Signed out or offline without a cached profile: let the page's own shell deal with it (sign-in
  // redirect, offline notice) rather than guessing here.
  if (!data && !loading) return <>{children}</>;
  if (!data) return <AuthenticatedShell>{null}</AuthenticatedShell>;
  if (needs.some((p) => data.user.permissions?.includes(p))) return <>{children}</>;
  return (
    <AuthenticatedShell>
      <NoAccess needs={needs} />
    </AuthenticatedShell>
  );
}

function NoAccess({ needs }: { needs: readonly Permission[] }) {
  const t = useTranslations("noAccess");
  const tp = useTranslations("permissions");
  const names = needs.map((p) => t("quoted", { name: tp(`p_${p.replace(/\./g, "_")}`) })).join(t("or"));
  return (
    <section className="mx-auto mt-16 max-w-md text-center" role="alert" aria-labelledby="no-access-title">
      <h1 id="no-access-title" className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
        {t("title")}
      </h1>
      <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{t("body", { permission: names })}</p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t("howToGet")}</p>
      <Link href="/dashboard" className="btn-primary mt-6 inline-flex">
        {t("back")}
      </Link>
    </section>
  );
}
