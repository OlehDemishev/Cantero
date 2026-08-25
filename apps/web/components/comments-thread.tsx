"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

type CommentParam = "taskId" | "rfiId" | "punchListItemId" | "projectId";

interface Member {
  id: string;
  name: string;
}
interface CommentItem {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
  mentions: { user: Member }[];
}

/** Reusable comment thread for tasks, RFIs, and punch-list items — same param/entityId
 * convention as PhotoAttachments. @mentions are picked from a dropdown (not parsed out of free
 * text), so the mentioned user id is always unambiguous even for names containing spaces. */
export function CommentsThread({ param, entityId }: { param: CommentParam; entityId: string }) {
  const t = useTranslations("comments");

  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [content, setContent] = useState("");
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<CommentItem[]>(`/comments?${param}=${entityId}`).then(setComments);
  }

  useEffect(() => {
    load();
    apiFetch<{ user: Member }[]>("/company/members").then((list) => setMembers(list.map((m) => m.user)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  function handleContentChange(value: string) {
    setContent(value);
    const atIndex = value.lastIndexOf("@");
    if (atIndex === -1) {
      setMentionQuery(null);
      return;
    }
    const afterAt = value.slice(atIndex + 1);
    setMentionQuery(/\s/.test(afterAt) ? null : afterAt);
  }

  function pickMention(member: Member) {
    const atIndex = content.lastIndexOf("@");
    setContent(content.slice(0, atIndex) + `@${member.name} `);
    setMentionedIds((prev) => (prev.includes(member.id) ? prev : [...prev, member.id]));
    setMentionQuery(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/comments", {
        method: "POST",
        body: JSON.stringify({ [param]: entityId, content, mentionedUserIds: mentionedIds }),
      });
      setContent("");
      setMentionedIds([]);
      load();
    } finally {
      setBusy(false);
    }
  }

  const filteredMembers =
    mentionQuery !== null ? members.filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase())) : [];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-700">{t("title")}</span>
      {comments === null ? null : comments.length === 0 ? (
        <p className="text-xs text-gray-400">{t("noComments")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md bg-gray-50 px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{c.authorName}</span>
                <span className="text-gray-400">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-gray-700">{c.content}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="relative flex flex-col gap-1.5">
        <textarea
          rows={2}
          className="input text-xs"
          placeholder={t("addCommentPlaceholder")}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
        />
        {mentionQuery !== null && filteredMembers.length > 0 && (
          <ul className="absolute bottom-full z-10 mb-1 max-h-32 w-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-theme-md dark:border-gray-800 dark:bg-gray-900">
            {filteredMembers.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => pickMention(m)}
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="submit" disabled={busy || !content.trim()} className="btn-secondary self-start px-2.5 py-1 text-xs">
          {t("post")}
        </button>
      </form>
    </div>
  );
}
