"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabNavItem {
  key: string;
  label: string;
}

const tabId = (base: string, key: string) => `${base}-tab-${key}`;
const panelId = (base: string) => `${base}-panel`;

/**
 * Horizontal tab bar for splitting a long page into sections, addressable via a `?tab=` query param by the caller.
 * A WAI-ARIA tablist: one Tab stop (the active tab), arrow keys / Home / End move between tabs and select them.
 * Pass `id` and wrap the content in `<TabPanel tabsId={id} active={…}>` to tie the tabs to it (aria-controls).
 */
export function TabNav({
  tabs,
  active,
  onChange,
  id,
  label,
}: {
  tabs: TabNavItem[];
  active: string;
  onChange: (key: string) => void;
  /** Shared with the TabPanel that shows the active tab's content. */
  id?: string;
  /** Accessible name of the tab list, when the page heading doesn't already say what it splits. */
  label?: string;
}) {
  const generatedId = useId();
  const base = id ?? generatedId;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className="custom-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800"
    >
      {tabs.map((tab, i) => {
        const selected = active === tab.key;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={tabId(base, tab.key)}
            aria-selected={selected}
            aria-controls={id ? panelId(id) : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={`tab-item ${selected ? "tab-item-active" : ""}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** The content of the active tab of the TabNav with the same id. */
export function TabPanel({ tabsId, active, className, children }: { tabsId: string; active: string; className?: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={panelId(tabsId)} aria-labelledby={tabId(tabsId, active)} className={className}>
      {children}
    </div>
  );
}
