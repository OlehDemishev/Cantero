import { test, expect } from "@playwright/test";
import { api, login } from "../api";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../fixtures";

/**
 * A person's own language: picked once in Settings → Account (or in the phone app's header), kept on
 * their profile, and shown wherever they sign in; "company language" goes back to following the
 * company. The demo company works in English.
 */
test("a person picks their own language, and can go back to the company's", async ({ page, context }) => {
  const token = await login();
  try {
    const before = await api<{ locale: string; user: { locale: string | null }; company: { locale: string } }>("GET", "/me", token);
    expect(before.user.locale).toBeNull();
    expect(before.locale).toBe(before.company.locale);

    await page.goto("/login");
    await page.evaluate((t) => localStorage.setItem("cantero_token", t), token);
    await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: page.url() }]);
    await page.goto("/settings?tab=account");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    // Picking Polish reloads the app in Polish and keeps it on the profile.
    await page.getByRole("combobox", { name: "My language" }).selectOption({ label: "Polski" });
    await expect(page.getByRole("heading", { name: "Ustawienia", level: 1 })).toBeVisible();
    const polish = await api<{ locale: string; user: { locale: string | null } }>("GET", "/me", token);
    expect(polish).toMatchObject({ locale: "pl", user: { locale: "pl" } });

    // Signing in again on a fresh browser starts in Polish too: the login page sets the cookie from /me.
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(DEMO_EMAIL);
    await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page.goto("/settings?tab=account");
    await expect(page.getByRole("heading", { name: "Ustawienia", level: 1 })).toBeVisible();

    // Back to the company's language.
    await page.getByRole("combobox", { name: "Mój język" }).selectOption({ label: "Język firmy (English)" });
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    const back = await api<{ locale: string; user: { locale: string | null } }>("GET", "/me", token);
    expect(back).toMatchObject({ locale: before.company.locale, user: { locale: null } });

    // Only the five supported languages are accepted.
    await expect(api("PATCH", "/me/language", token, { locale: "ru" })).rejects.toThrow(/400/);
  } finally {
    await api("PATCH", "/me/language", token, { locale: null });
  }
});
