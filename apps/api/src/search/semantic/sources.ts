/**
 * What meaning-based search indexes, one entry per record type. `text` is a SQL expression over the
 * record's own row (alias `r`): the exact text that gets embedded, and — through md5() of that same
 * expression — the change detector, so the indexer finds edited records in SQL without the tables
 * needing an updatedAt column (most of these don't have one).
 */
export const SEMANTIC_TYPES = ["rfi", "punch_list_item", "daily_log", "task"] as const;
export type SemanticType = (typeof SEMANTIC_TYPES)[number];

export interface SemanticSource {
  type: SemanticType;
  table: string;
  text: string;
}

export const SOURCES: Record<SemanticType, SemanticSource> = {
  rfi: {
    type: "rfi",
    table: "rfis",
    text: `concat_ws(E'\\n', r.subject, r.question, r.answer)`,
  },
  punch_list_item: {
    type: "punch_list_item",
    table: "punch_list_items",
    text: `concat_ws(E'\\n', r.title, r.location, r.description)`,
  },
  daily_log: {
    type: "daily_log",
    table: "daily_logs",
    text: `concat_ws(E'\\n', r."workPerformed", r.delays, r.notes)`,
  },
  task: {
    type: "task",
    table: "tasks",
    text: `r.name`,
  },
};

/** Where a result opens in the web app. */
export function linkFor(type: SemanticType, projectId: string, id: string): string {
  switch (type) {
    case "rfi":
      return `/projects/${projectId}?tab=quality&itemType=rfi&itemId=${id}`;
    case "punch_list_item":
      return `/projects/${projectId}?tab=quality&itemType=punch_list&itemId=${id}`;
    case "daily_log":
      return `/projects/${projectId}?tab=field`;
    case "task":
      return `/projects/${projectId}?tab=schedule`;
  }
}
