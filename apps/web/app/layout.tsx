import type { Metadata, Viewport } from "next";
import { Onest, Outfit } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ThemeProvider } from "@/context/ThemeContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { PwaRegister } from "@/components/pwa-register";
import { SentryInit } from "@/components/sentry-init";
import { ToastProvider } from "@/components/ui/toast-provider";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";
import { PageTitle } from "@/components/page-title";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin", "latin-ext"],
});

// Outfit has no Cyrillic, so Ukrainian (html lang="uk", see globals.css) switches to Onest, a
// similar geometric sans that has it. Not preloaded: the browser only fetches it when it is used.
const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  preload: false,
});

// No `title` here: <PageTitle /> renders it per page ("Projects · Cantero"), and a metadata title
// would add a second, competing <title> that streaming metadata can re-apply after navigation.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("labels");
  return {
    description: t("metaDescription"),
    appleWebApp: { capable: true, statusBarStyle: "default", title: "Cantero" },
  };
}

export const viewport: Viewport = {
  themeColor: "#465fff",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    // suppressHydrationWarning: THEME_INIT_SCRIPT adds `dark` to this element's class before React
    // hydrates it, which would otherwise be reported as a mismatch (it only silences this element).
    <html lang={locale} className={`${outfit.variable} ${onest.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Blocking on purpose: it has to run before the first paint to avoid a light flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <SidebarProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <PageTitle />
                  {children}
                  <PwaRegister />
                  <SentryInit />
                </ConfirmProvider>
              </ToastProvider>
            </SidebarProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
