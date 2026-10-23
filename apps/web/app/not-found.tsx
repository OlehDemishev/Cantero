import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicBrand } from "@/components/public-link-error";

/** The 404 for unmatched URLs and notFound() — Next's default one is English only. */
export default async function NotFound() {
  const t = await getTranslations("appErrors");
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <PublicBrand />
        <div className="card">
          <h1 className="text-lg font-semibold text-fg">{t("notFoundTitle")}</h1>
          <p className="mt-2 text-sm text-fg-subtle">{t("notFoundBody")}</p>
          <Link href="/" className="btn-primary mt-4 inline-block">
            {t("notFoundHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}
