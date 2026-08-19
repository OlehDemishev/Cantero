export const MEMBERSHIP_ROLES = [
  "owner",
  "admin",
  "estimator",
  "foreman",
  "accountant",
  "worker",
] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
