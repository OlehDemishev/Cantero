import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

type EmptyStateCta = { label: string; href: string } | { label: string; onClick: () => void };

interface EmptyStateProps {
  message: string;
  cta?: EmptyStateCta;
  /** Renders the richer icon+title layout instead of the default inline text line — use for a
   * page's own primary empty state, not for small embedded sub-panel states (those stay compact). */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title?: string;
}

export function EmptyState({ message, cta, icon: Icon, title }: EmptyStateProps) {
  if (!Icon && !title) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500">
        {message}
        {cta && "href" in cta && (
          <>
            {" "}
            <Link href={cta.href} className="font-medium text-brand-700 dark:text-brand-400 hover:underline">
              {cta.label}
            </Link>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      {Icon && (
        <div className="flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500">
          <Icon className="size-6" />
        </div>
      )}
      <div>
        {title && <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</p>}
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{message}</p>
      </div>
      {cta &&
        ("href" in cta ? (
          <Link href={cta.href} className="btn-primary">
            {cta.label}
          </Link>
        ) : (
          <button type="button" onClick={cta.onClick} className="btn-primary">
            {cta.label}
          </button>
        ))}
    </div>
  );
}
