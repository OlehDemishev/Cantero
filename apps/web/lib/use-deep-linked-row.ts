"use client";

import { useSearchParams } from "next/navigation";

/**
 * Reads `itemType`/`itemId` from the URL and returns the id when this panel's `entityType`
 * matches — lets a panel land on and expand a specific row when the page was opened via a
 * deep link (e.g. a "copy link" button elsewhere, or a notification). See project-detail.tsx's
 * ITEM_TYPE_TO_TAB for how the owning tab gets activated before this hook's value is used.
 */
export function useDeepLinkedRow(entityType: string): string | null {
  const searchParams = useSearchParams();
  const itemType = searchParams.get("itemType");
  const itemId = searchParams.get("itemId");
  return itemType === entityType ? itemId : null;
}

/** Builds a shareable deep-link URL to a specific sub-entity row on a project page. */
export function buildItemDeepLink(projectId: string, tab: string, itemType: string, itemId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/projects/${projectId}?tab=${tab}&itemType=${itemType}&itemId=${itemId}`;
}
