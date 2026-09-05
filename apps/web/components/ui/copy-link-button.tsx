"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/** Small icon button that copies a deep-link URL to the clipboard, with a brief "copied" confirmation. */
export function CopyLinkButton({ url }: { url: string }) {
  const tc = useTranslations("common");
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={tc("copyLink")}
      className="inline-flex items-center gap-1 rounded px-1 text-xs text-gray-400 hover:text-gray-600"
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 11.5a3 3 0 0 0 4.24 0l2-2a3 3 0 0 0-4.24-4.24l-.5.5" />
        <path d="M11.5 8.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 0 0 4.24 4.24l.5-.5" />
      </svg>
      {copied && tc("linkCopied")}
    </button>
  );
}
