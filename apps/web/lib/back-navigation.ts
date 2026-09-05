/** A hardcoded "back" link always lands on the list page, even when the user actually arrived from
 * a search result, a deep link, or another entity's detail page — router.back() respects how they
 * got here. `window.history.length` is 1 only when this tab has no prior entry to go back to (a
 * fresh tab, a direct URL, a page reload), so it falls back to fallbackHref in exactly that case. */
export function goBack(router: { back: () => void; push: (href: string) => void }, fallbackHref: string): void {
  if (typeof window !== "undefined" && window.history.length > 1) {
    router.back();
  } else {
    router.push(fallbackHref);
  }
}
