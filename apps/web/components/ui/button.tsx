import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "xs" | "sm" | "md";

const SIZE_CLASS: Record<ButtonSize, string> = { xs: "btn-xs", sm: "btn-sm", md: "" };

/**
 * The class list for a button-looking element, built on the global .btn-* classes in
 * app/globals.css — for the rare element Button can't render (a <label> wrapping a file input).
 */
export function buttonClassName({ variant = "primary", size = "md", className = "" }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return `btn-${variant} ${SIZE_CLASS[size]} ${className}`.replace(/\s+/g, " ").trim();
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and sets aria-busy; the label stays in place. */
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
export type LinkButtonProps = CommonProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; prefetch?: boolean };

function Spinner() {
  return <span aria-hidden="true" className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

/**
 * Button in one of four variants and three sizes. With `href` it renders a Next.js <Link> that
 * looks the same. Defaults to type="button"; pass type="submit" in a form.
 */
export function Button(props: ButtonProps | LinkButtonProps) {
  if (props.href !== undefined) {
    const { variant, size, loading, className, children, href, ...rest } = props;
    return (
      <Link href={href} {...rest} aria-busy={loading || undefined} className={buttonClassName({ variant, size, className })}>
        {loading && <Spinner />}
        {children}
      </Link>
    );
  }
  const { variant, size, loading, className, children, type = "button", disabled, ...rest } = props;
  return (
    <button
      type={type}
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, className })}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
