-- Lets a company hide sidebar nav items it doesn't use (see AppSidebar's NAV_GROUPS in
-- authenticated-shell.tsx). Empty by default so no existing company's menu changes until they
-- opt in via Settings or the onboarding wizard's business-profile step.
ALTER TABLE "companies" ADD COLUMN     "hiddenNavItems" TEXT[] DEFAULT ARRAY[]::TEXT[];
