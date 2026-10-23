import { MeProvider } from "@/lib/use-me";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { RouteAccessGate } from "@/components/route-access-gate";

/**
 * The signed-in app: every page with the menu. The group folder doesn't show in URLs. Mounted once
 * and kept across navigation between these pages, so the menu stays put and /me is asked once
 * (MeProvider). Pages render only once /me has answered for an active subscription — a signed-out
 * visit goes to /login before any page fetches — and only if the member may open them
 * (RouteAccessGate). Sign-in, portals, public links and the full-screen field/kiosk, billing and
 * onboarding pages live outside it.
 */
export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <AuthenticatedShell>
        <RouteAccessGate>{children}</RouteAccessGate>
      </AuthenticatedShell>
    </MeProvider>
  );
}
