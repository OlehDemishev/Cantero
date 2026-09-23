"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { TICKET_PRIORITIES, TICKET_STATUSES, type TicketPriority, type TicketStatus } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";
import { useCan } from "@/lib/permissions";

interface Member {
  id: string;
  name: string;
}
interface Client {
  id: string;
  name: string;
}
interface SlaFlags {
  responseBreached: boolean;
  resolutionBreached: boolean;
}
interface Ticket {
  id: string;
  subject: string;
  category: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  requesterName: string;
  requesterClient: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  createdAt: string;
  sla: SlaFlags;
}
interface TicketMessage {
  id: string;
  content: string;
  authorName: string;
  isInternal: boolean;
  createdAt: string;
}
interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  in_progress: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400",
  waiting_on_customer: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
  resolved: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  closed: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
};
const PRIORITY_STYLES: Record<TicketPriority, string> = {
  low: "text-gray-400 dark:text-gray-500",
  medium: "text-gray-600 dark:text-gray-300",
  high: "text-warning-700 dark:text-warning-500",
  urgent: "text-error-700 dark:text-error-500",
};

export default function SupportTicketsPage() {
  const t = useTranslations("supportTickets");
  const tc = useTranslations("common");
  const isManager = useCan()("site.manage");

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [members, setMembers] = useState<Member[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyInternal, setReplyInternal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ requesterClientId: "", requesterName: "", requesterEmail: "", subject: "", category: "", priority: "medium" as TicketPriority });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Ticket[]>(`/support-tickets${statusFilter ? `?status=${statusFilter}` : ""}`).then(setTickets);
  }
  useEffect(load, [statusFilter]);

  useEffect(() => {
    apiFetch<{ user: Member }[]>("/company/members").then((list) => setMembers(list.map((m) => m.user)));
    apiFetch<Client[]>("/clients").then(setClients);
  }, []);

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!form.requesterName.trim() || !form.subject.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/support-tickets", {
        method: "POST",
        body: JSON.stringify({
          requesterClientId: form.requesterClientId || undefined,
          requesterName: form.requesterName.trim(),
          requesterEmail: form.requesterEmail || undefined,
          subject: form.subject.trim(),
          category: form.category || undefined,
          priority: form.priority,
        }),
      });
      setForm({ requesterClientId: "", requesterName: "", requesterEmail: "", subject: "", category: "", priority: "medium" });
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    const d = await apiFetch<TicketDetail>(`/support-tickets/${id}`);
    setDetail(d);
  }

  async function refreshDetail(id: string) {
    const d = await apiFetch<TicketDetail>(`/support-tickets/${id}`);
    setDetail(d);
    load();
  }

  async function updateStatus(id: string, status: TicketStatus) {
    setBusy(true);
    try {
      await apiFetch(`/support-tickets/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      refreshDetail(id);
    } finally {
      setBusy(false);
    }
  }

  async function assign(id: string, userId: string) {
    setBusy(true);
    try {
      await apiFetch(`/support-tickets/${id}/assign`, { method: "POST", body: JSON.stringify({ userId: userId || null }) });
      refreshDetail(id);
    } finally {
      setBusy(false);
    }
  }

  async function reply(id: string) {
    if (!replyText.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/support-tickets/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: replyText.trim(), isInternal: replyInternal }),
      });
      setReplyText("");
      refreshDetail(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-3">
          {isManager && (
            <Link href="/settings?tab=operations" className="text-xs font-medium text-brand-700 dark:text-brand-400 hover:underline">
              {t("manageSlaPolicies")}
            </Link>
          )}
          {!adding && (
            <button onClick={() => setAdding(true)} className="btn-secondary px-3 py-1.5 text-sm">
              {t("newTicket")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setStatusFilter("")}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${statusFilter === "" ? "bg-brand-600 text-white" : "btn-secondary"}`}
        >
          {tc("all")}
        </button>
        {TICKET_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${statusFilter === s ? "bg-brand-600 text-white" : "btn-secondary"}`}
          >
            {t(`status_${s}`)}
          </button>
        ))}
      </div>

      {adding && (
        <form onSubmit={createTicket} className="card mt-4 flex flex-col gap-2 max-w-lg">
          <select className="input" value={form.requesterClientId} onChange={(e) => setForm((f) => ({ ...f, requesterClientId: e.target.value }))}>
            <option value="">{t("internalRequester")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            required
            placeholder={t("requesterNamePlaceholder")}
            className="input"
            value={form.requesterName}
            onChange={(e) => setForm((f) => ({ ...f, requesterName: e.target.value }))}
          />
          <input
            placeholder={t("requesterEmailPlaceholder")}
            className="input"
            value={form.requesterEmail}
            onChange={(e) => setForm((f) => ({ ...f, requesterEmail: e.target.value }))}
          />
          <input
            required
            placeholder={t("subjectPlaceholder")}
            className="input"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          />
          <div className="flex gap-2">
            <input
              placeholder={t("categoryPlaceholder")}
              className="input"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
            <select className="input w-auto" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TicketPriority }))}>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`priority_${p}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("create")}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        {!tickets ? (
          <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
        ) : tickets.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">{t("noTickets")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tickets.map((ticket) => {
              const expanded = expandedId === ticket.id;
              return (
                <li key={ticket.id} className="card">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(ticket.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggleExpand(ticket.id)}
                    className="flex w-full cursor-pointer items-center justify-between text-left"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{ticket.subject}</span>
                      {ticket.requesterClient ? (
                        <Link
                          href={`/clients/${ticket.requesterClient.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-2 text-xs text-brand-700 dark:text-brand-400 hover:underline"
                        >
                          {ticket.requesterClient.name}
                        </Link>
                      ) : (
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{ticket.requesterName}</span>
                      )}
                      {ticket.project && (
                        <Link
                          href={`/projects/${ticket.project.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-2 text-xs text-brand-700 dark:text-brand-400 hover:underline"
                        >
                          {ticket.project.name}
                        </Link>
                      )}
                      <span className={`ml-2 text-xs font-medium ${PRIORITY_STYLES[ticket.priority]}`}>{t(`priority_${ticket.priority}`)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(ticket.sla.responseBreached || ticket.sla.resolutionBreached) && (
                        <span className="rounded-full bg-error-50 dark:bg-error-500/15 px-2 py-0.5 text-xs font-medium text-error-700 dark:text-error-500">{t("slaBreached")}</span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[ticket.status]}`}>{t(`status_${ticket.status}`)}</span>
                    </div>
                  </div>

                  {expanded && detail && detail.id === ticket.id && (
                    <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="input w-auto"
                          value={detail.assignedTo?.id ?? ""}
                          onChange={(e) => assign(ticket.id, e.target.value)}
                        >
                          <option value="">{t("unassigned")}</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        {TICKET_STATUSES.filter((s) => s !== ticket.status).map((s) => (
                          <button key={s} onClick={() => updateStatus(ticket.id, s)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                            {t(`moveTo_${s}`)}
                          </button>
                        ))}
                      </div>

                      <ul className="flex flex-col gap-2">
                        {detail.messages.map((m) => (
                          <li key={m.id} className={`rounded-md px-3 py-2 text-sm ${m.isInternal ? "bg-warning-50 dark:bg-warning-500/15" : "bg-gray-50 dark:bg-gray-700"}`}>
                            <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                              <span>
                                {m.authorName}
                                {m.isInternal && <span className="ml-1.5 font-medium text-warning-700 dark:text-warning-500">{t("internalNote")}</span>}
                              </span>
                              <span>{formatDateTime(new Date(m.createdAt))}</span>
                            </div>
                            <p className="mt-1 text-gray-700 dark:text-gray-200">{m.content}</p>
                          </li>
                        ))}
                      </ul>

                      <div className="flex flex-col gap-2">
                        <textarea
                          rows={2}
                          placeholder={t("replyPlaceholder")}
                          className="input"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                        />
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                            <input type="checkbox" checked={replyInternal} onChange={(e) => setReplyInternal(e.target.checked)} />
                            {t("internalNote")}
                          </label>
                          <button onClick={() => reply(ticket.id)} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">
                            {t("sendReply")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AuthenticatedShell>
  );
}
