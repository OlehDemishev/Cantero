import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ThemeProvider } from "@/context/ThemeContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { PwaRegister } from "@/components/pwa-register";
import { SentryInit } from "@/components/sentry-init";
import { ToastProvider } from "@/components/ui/toast-provider";
import { PageTitle } from "@/components/page-title";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

// No `title` here: <PageTitle /> renders it per page ("Projects · Cantero"), and a metadata title
// would add a second, competing <title> that streaming metadata can re-apply after navigation.
export const metadata: Metadata = {
  description: "Estimate → materials → invoice, in one place.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Cantero" },
};

export const viewport: Viewport = {
  themeColor: "#465fff",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <SidebarProvider>
              <ToastProvider>
                <PageTitle />
                {children}
                <PwaRegister />
                <SentryInit />
              </ToastProvider>
            </SidebarProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
