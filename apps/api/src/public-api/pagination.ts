export interface PageParams {
  limit?: number;
  offset?: number;
}

export const MAX_PAGE_LIMIT = 500;

/** Parses ?limit=&offset= query strings into bounded numbers, or undefined when neither is
 * given — callers treat "undefined limit" as "no pagination requested, return everything",
 * so a plain `/v1/projects` call with no query params keeps its pre-pagination behavior. */
export function parsePageParams(limitRaw: string | undefined, offsetRaw: string | undefined): PageParams | undefined {
  if (limitRaw === undefined && offsetRaw === undefined) return undefined;
  const limit = limitRaw !== undefined ? Math.min(Math.max(Number(limitRaw) || 0, 1), MAX_PAGE_LIMIT) : MAX_PAGE_LIMIT;
  const offset = offsetRaw !== undefined ? Math.max(Number(offsetRaw) || 0, 0) : 0;
  return { limit, offset };
}

/** Slices `rows` per `page`, or returns them unchanged when no pagination was requested. */
export function paginate<T>(rows: T[], page: PageParams | undefined): T[] {
  if (!page) return rows;
  return rows.slice(page.offset ?? 0, (page.offset ?? 0) + (page.limit ?? MAX_PAGE_LIMIT));
}
