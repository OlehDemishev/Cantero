"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { BellIcon } from "@/components/nav-icons";

type NotificationType =
  | "low_stock"
  | "reminder_due"
  | "invoice_overdue"
  | "rfi_open"
  | "punch_list_open"
  | "submittal_pending"
  | "safety_incident";
type Severity = "warning" | "critical";

interface Notification {
  key: string;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string;
  link: string;
  occurredAt: string;
}

interface NotificationsResponse {
  unreadCount: number;
  notifications: Notification[];
}

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const t = useTranslations("notifications");
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function load() {
    apiFetch<NotificationsResponse>("/notifications").then(setData);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function toggleOpen() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && data && data.unreadCount > 0) {
      await apiFetch("/notifications/mark-seen", { method: "POST" });
      setData((d) => (d ? { ...d, unreadCount: 0 } : d));
    }
  }

  const unread = data?.unreadCount ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggleOpen}
        aria-label={t("title")}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-theme-md dark:border-gray-800 dark:bg-gray-900">
          <div className="px-2 py-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300">{t("title")}</div>
          {!data ? (
            <p className="px-2 py-3 text-sm text-gray-400">{t("loading")}</p>
          ) : data.notifications.length === 0 ? (
            <p className="px-2 py-3 text-sm text-gray-400">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {data.notifications.map((n) => (
                <li key={n.key}>
                  <a
                    href={n.link}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2 py-2 hover:bg-gray-100 dark:hover:bg-white/5"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${
                          n.severity === "critical" ? "bg-error-500" : "bg-warning-500"
                        }`}
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-800 dark:text-white/90">{n.title}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{n.body}</div>
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
