"use client";

import { useMemo } from "react";
import { CREW_PERMISSIONS, MEMBERSHIP_ROLES_MANAGEABLE, seesCrew, type Permission } from "@cantero/shared";
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

/**
 * The roles this member may give someone. Whoever holds settings.roles manages the team, but making
 * or unmaking an admin stays with the owner — the API refuses it otherwise.
 */
export function useAssignableRoles(): { roles: readonly string[]; mayTouchAdmin: boolean } {
  const { data: me } = useMe();
  const mayTouchAdmin = me?.user.role === "owner";
  return { roles: mayTouchAdmin ? MEMBERSHIP_ROLES_MANAGEABLE : MEMBERSHIP_ROLES_MANAGEABLE.filter((r) => r !== "admin"), mayTouchAdmin };
}

/**
 * Whose time or expenses a form may record. A member who may act for the crew (CREW_PERMISSIONS, the
 * table the API enforces) picks anyone and starts on themselves; everyone else gets only the employee
 * record linked to their own account, so the form never offers a choice the server refuses.
 */
export function useCrewChoices<W extends { id: string; userId: string | null }>(workers: readonly W[], kind: keyof typeof CREW_PERMISSIONS) {
  const { data: me } = useMe();
  const meUserId = me?.user.id;
  const crew = seesCrew(me?.user.permissions, kind);
  return useMemo(() => {
    const own = workers.find((w) => meUserId !== undefined && w.userId === meUserId);
    const choices = crew ? [...workers] : own ? [own] : [];
    return { crew, choices, initialId: (own ?? choices[0])?.id ?? "" };
  }, [workers, meUserId, crew]);
}
