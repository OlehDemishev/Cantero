import { RouteAccessGate } from "@/components/route-access-gate";

/** The setup wizard is full-screen, outside the signed-in layout, but still only for whoever may
 * set up the company (lib/route-access.ts). */
export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return <RouteAccessGate>{children}</RouteAccessGate>;
}
