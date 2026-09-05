"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useDeepLinkedRow, buildItemDeepLink } from "@/lib/use-deep-linked-row";
import { CopyLinkButton } from "@/components/ui/copy-link-button";
import { PrintButton } from "@/components/ui/print-button";
import { formatDate } from "@/lib/format-date";

interface MeetingActionItem {
  id: string;
  description: string;
  ownerName: string;
  dueDate: string | null;
  status: "open" | "done";
  resolvedByName: string | null;
}
interface Meeting {
  id: string;
  number: number;
  title: string;
  meetingDate: string;
  location: string | null;
  attendees: string[];
  notes: string | null;
  actionItems: MeetingActionItem[];
}
interface OpenActionItem extends MeetingActionItem {
  meeting: { id: string; number: number; title: string };
}

const EMPTY_FORM = {
  title: "",
  meetingDate: "",
  location: "",
  attendeesText: "",
  notes: "",
};

export function MeetingsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("meetings");
  const tc = useTranslations("common");

  const deepLinkedId = useDeepLinkedRow("meeting");
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const [items, setItems] = useState<Meeting[] | null>(null);
  const [openItems, setOpenItems] = useState<OpenActionItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(deepLinkedId);
  const [busy, setBusy] = useState(false);
  const [actionItemDrafts, setActionItemDrafts] = useState<Record<string, { description: string; ownerName: string }>>({});

  function load() {
    apiFetch<Meeting[]>(`/meetings?projectId=${projectId}`).then(setItems);
    apiFetch<OpenActionItem[]>(`/meetings/open-action-items?projectId=${projectId}`).then(setOpenItems);
  }

  useEffect(load, [projectId]);

  useEffect(() => {
    if (!deepLinkedId || !items) return;
    rowRefs.current[deepLinkedId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, deepLinkedId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const attendees = form.attendeesText
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      await apiFetch("/meetings", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: form.title,
          meetingDate: new Date(form.meetingDate).toISOString(),
          location: form.location || undefined,
          attendees,
          notes: form.notes || undefined,
          actionItems: [],
        }),
      });
      setForm(EMPTY_FORM);
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addActionItem(meetingId: string) {
    const draft = actionItemDrafts[meetingId];
    if (!draft?.description.trim() || !draft?.ownerName.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/meetings/${meetingId}/action-items`, {
        method: "POST",
        body: JSON.stringify({ description: draft.description, ownerName: draft.ownerName }),
      });
      setActionItemDrafts((f) => ({ ...f, [meetingId]: { description: "", ownerName: "" } }));
      load();
    } finally {
      setBusy(false);
    }
  }

  async function resolveActionItem(itemId: string, resolvedByName: string) {
    if (!resolvedByName.trim()) return;
    await apiFetch(`/meetings/action-items/${itemId}/resolve`, { method: "POST", body: JSON.stringify({ resolvedByName }) });
    load();
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("title")}</h2>
        <div className="flex items-center gap-1.5">
          {!creating && (
            <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
              {t("newMeeting")}
            </button>
          )}
          <PrintButton />
        </div>
      </div>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("meetingTitle")}</span>
            <input required className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("meetingDate")}</span>
              <input
                required
                type="date"
                className="input"
                value={form.meetingDate}
                onChange={(e) => setForm((f) => ({ ...f, meetingDate: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("location")}</span>
              <input className="input" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("attendees")}</span>
            <input
              placeholder={t("attendeesPlaceholder")}
              className="input"
              value={form.attendeesText}
              onChange={(e) => setForm((f) => ({ ...f, attendeesText: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("notes")}</span>
            <textarea rows={3} className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {openItems.length > 0 && (
        <div className="card mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("openActionItems")}</h3>
          <ul className="flex flex-col gap-1.5">
            {openItems.map((item) => (
              <OpenActionItemRow key={item.id} item={item} onResolve={resolveActionItem} t={t} />
            ))}
          </ul>
        </div>
      )}

      {items === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noItems")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((meeting) => {
            const expanded = expandedId === meeting.id;
            const draft = actionItemDrafts[meeting.id] ?? { description: "", ownerName: "" };
            return (
              <li
                key={meeting.id}
                ref={(el) => { rowRefs.current[meeting.id] = el; }}
                className={`card ${deepLinkedId === meeting.id ? "ring-2 ring-brand-300" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <CopyLinkButton url={buildItemDeepLink(projectId, "quality", "meeting", meeting.id)} />
                  <button onClick={() => setExpandedId(expanded ? null : meeting.id)} className="flex w-full items-start justify-between gap-3 text-left">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400">#{meeting.number}</span>
                        <span className="text-sm font-medium text-gray-900">{meeting.title}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{formatDate(new Date(meeting.meetingDate))}</div>
                    </div>
                  {meeting.actionItems.filter((a) => a.status === "open").length > 0 && (
                    <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">
                      {t("openCount", { count: meeting.actionItems.filter((a) => a.status === "open").length })}
                    </span>
                  )}
                  </button>
                </div>

                {expanded && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 text-sm">
                    {meeting.location && (
                      <p>
                        <span className="font-medium text-gray-700">{t("location")}: </span>
                        {meeting.location}
                      </p>
                    )}
                    {meeting.attendees.length > 0 && (
                      <p>
                        <span className="font-medium text-gray-700">{t("attendees")}: </span>
                        {meeting.attendees.join(", ")}
                      </p>
                    )}
                    {meeting.notes && (
                      <p>
                        <span className="font-medium text-gray-700">{t("notes")}: </span>
                        {meeting.notes}
                      </p>
                    )}

                    <div className="mt-1">
                      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("actionItems")}</h4>
                      {meeting.actionItems.length === 0 ? (
                        <p className="text-xs text-gray-400">{t("noActionItems")}</p>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {meeting.actionItems.map((item) => (
                            <li key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs">
                              <div>
                                <span className={item.status === "done" ? "text-gray-400 line-through" : "text-gray-700"}>{item.description}</span>
                                <span className="ml-1.5 text-gray-400">— {item.ownerName}</span>
                              </div>
                              {item.status === "open" ? (
                                <ResolveButton itemId={item.id} onResolve={resolveActionItem} t={t} />
                              ) : (
                                <span className="text-success-700">{t("resolvedBy", { name: item.resolvedByName ?? "" })}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <input
                          placeholder={t("actionItemDescriptionPlaceholder")}
                          className="input flex-1 py-1 text-xs"
                          value={draft.description}
                          onChange={(e) => setActionItemDrafts((f) => ({ ...f, [meeting.id]: { ...draft, description: e.target.value } }))}
                        />
                        <input
                          placeholder={t("actionItemOwnerPlaceholder")}
                          className="input w-40 py-1 text-xs"
                          value={draft.ownerName}
                          onChange={(e) => setActionItemDrafts((f) => ({ ...f, [meeting.id]: { ...draft, ownerName: e.target.value } }))}
                        />
                        <button
                          onClick={() => addActionItem(meeting.id)}
                          disabled={busy || !draft.description.trim() || !draft.ownerName.trim()}
                          className="btn-secondary px-2.5 py-1 text-xs"
                        >
                          {t("addActionItem")}
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
  );
}

function ResolveButton({ itemId, onResolve, t }: { itemId: string; onResolve: (id: string, name: string) => void; t: ReturnType<typeof useTranslations> }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary px-2 py-0.5 text-xs">
        {t("resolve")}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        placeholder={t("resolvedByPlaceholder")}
        className="input w-28 py-0.5 text-xs"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        onClick={() => {
          onResolve(itemId, name);
          setOpen(false);
        }}
        disabled={!name.trim()}
        className="btn-primary px-2 py-0.5 text-xs"
      >
        {t("resolve")}
      </button>
    </div>
  );
}

function OpenActionItemRow({
  item,
  onResolve,
  t,
}: {
  item: OpenActionItem;
  onResolve: (id: string, name: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs">
      <div>
        <span className="text-gray-700">{item.description}</span>
        <span className="ml-1.5 text-gray-400">
          — {item.ownerName} · {t("fromMeeting", { number: item.meeting.number, title: item.meeting.title })}
        </span>
      </div>
      <ResolveButton itemId={item.id} onResolve={onResolve} t={t} />
    </li>
  );
}
