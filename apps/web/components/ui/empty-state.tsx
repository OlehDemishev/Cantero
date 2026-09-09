import Link from "next/link";

export function EmptyState({ message, cta }: { message: string; cta?: { label: string; href: string } }) {
  return (
    <p className="text-sm text-gray-400">
      {message}
      {cta && (
        <>
          {" "}
          <Link href={cta.href} className="font-medium text-brand-700 hover:underline">
            {cta.label}
          </Link>
        </>
      )}
    </p>
  );
}
