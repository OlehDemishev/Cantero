"use client";

import type { Permission } from "@cantero/shared";
import { useMe } from "./use-me";

/**
 * Whether the signed-in member holds a capability — their role's defaults with the company's own
 * settings applied, exactly as the API decides. False until /me has loaded, so nothing is shown or
 * fetched for a member who can't have it.
 */
export function useCan(): (permission: Permission) => boolean {
  const { data: me } = useMe();
  return (permission) => !!me?.user.permissions?.includes(permission);
}
