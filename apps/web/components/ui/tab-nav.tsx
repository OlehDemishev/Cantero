"use client";

export interface TabNavItem {
  key: string;
  label: string;
}

/** Horizontal tab bar for splitting a long page into sections, addressable via a `?tab=` query param by the caller. */
export function TabNav({ tabs, active, onChange }: { tabs: TabNavItem[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="custom-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`tab-item ${active === tab.key ? "tab-item-active" : ""}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
