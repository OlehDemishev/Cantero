import Link from "next/link";
import type { ReactNode } from "react";

export interface PageHeaderProps {
  /** The page's <h1>. */
  title: ReactNode;
  /** One line under the title. */
  description?: ReactNode;
  /** Buttons/links at the right of the title (they wrap under it on narrow screens). */
  actions?: ReactNode;
  /** "← Projects" above the title, back to the list or parent record. */
  back?: { href: string; label: ReactNode };
  /** Extra content between the title row and the description (badges, meta line). */
  meta?: ReactNode;
  className?: string;
}

/** The heading block every top-level page starts with: optional back link, h1, actions, description. */
export function PageHeader({ title, description, actions, back, meta, className = "" }: PageHeaderProps) {
  return (
    <header className={className}>
      {back && (
        <Link href={back.href} className="text-sm text-fg-subtle hover:text-fg-muted hover:underline">
          ← {back.label}
        </Link>
      )}
      <div className={`flex flex-wrap items-center justify-between gap-3 ${back ? "mt-2" : ""}`}>
        <h1 className="text-2xl font-semibold text-fg">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta && <div className="mt-1">{meta}</div>}
      {description && <p className="mt-1 text-sm text-fg-subtle">{description}</p>}
    </header>
  );
}
