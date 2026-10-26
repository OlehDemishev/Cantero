import { PublicLocaleProvider } from "@/components/public-locale";

/** Lets the page switch to the client's or company's language (components/public-locale.tsx). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PublicLocaleProvider>{children}</PublicLocaleProvider>;
}
