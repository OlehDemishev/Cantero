# Cantero Desktop

An Electron shell around the existing Cantero web app (`apps/web`) — no separate frontend, this
just wraps the same web app in native window/menu chrome. Packages for Windows (NSIS installer)
and macOS (DMG + zip, x64 + arm64) from the same code.

## How it works

`src/main.ts` opens one `BrowserWindow` pointed at `CANTERO_APP_URL` (env var, defaults to
`http://localhost:3000` for local dev). The renderer runs with `nodeIntegration: false` /
`contextIsolation: true` / `sandbox: true` — the loaded page is treated exactly like any other
web content a browser would load, not given Node access, since it's the same web app whose
frontend code isn't written assuming it runs with elevated privileges. Navigating to any URL
outside the app's own origin (Stripe checkout, SSO IdP pages, mailto: links) opens in the OS's
default browser instead of inside the app window.

## Local development

```bash
cp .env.example .env   # only needed if you're not using the http://localhost:3000 default
pnpm dev:web            # in apps/web — the desktop shell needs something to load
pnpm --filter @cantero/desktop dev
```

## Building installers

```bash
pnpm --filter @cantero/desktop dist:win   # NSIS installer
pnpm --filter @cantero/desktop dist:mac   # DMG + zip, x64 + arm64
```

Output lands in `apps/desktop/release/` (gitignored — these are large binaries, not source).
Cross-building the Windows NSIS installer from macOS/Linux needs `wine` installed (electron-builder
shells out to it); building on an actual Windows machine or a Windows CI runner avoids that
dependency entirely and is the more reliable option. macOS builds only need to run on macOS.

Before packaging a build meant for real users, set `CANTERO_APP_URL` (in the environment the build
runs in, not just `.env` — see `electron-builder.yml`'s `files` list, `.env` isn't bundled into the
app) to the actual deployed web app URL. There's no baked-in production default on purpose.

macOS builds are signed with whatever code-signing identity is available in the local keychain
(ad-hoc if none), and notarization is skipped — fine for local testing, but Gatekeeper will warn
anyone else who downloads it. Real distribution needs a Developer ID Application certificate
(`CSC_LINK`/`CSC_KEY_PASSWORD`) and notarization credentials
(`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD` or `APPLE_API_KEY`) set in the build environment.

## Auto-updates

`electron-updater` (`src/updater.ts`) checks GitHub Releases on this repo on launch and every 4
hours while the app stays open, downloads new versions in the background, and prompts (native OS
notification) to restart once one's ready. This only runs in packaged builds (`app.isPackaged`) —
there's nothing for it to replace when running `electron .` in dev.

GitHub Releases works as the update feed because **this repository is public** — a private repo
would need a GitHub token embedded in every shipped copy of the app just so end users' installs
could authenticate to download release assets, which is a real credential-leak risk (anyone can
extract a string from a distributed binary). If the repo ever needs to go private again, switch
`electron-builder.yml`'s `publish` block to a `generic` provider pointing at a self-hosted URL
(no token needed on the client side) instead of re-introducing that risk.

To publish a release (uploads the installers to GitHub Releases as a draft, and generates the
`latest.yml` / `latest-mac.yml` metadata electron-updater reads):

```bash
GH_TOKEN=<a token with repo scope> pnpm --filter @cantero/desktop build
GH_TOKEN=<...> npx --prefix apps/desktop electron-builder --mac --win --publish always
```

`gh auth token` works as the `GH_TOKEN` value if you're already authenticated with the GitHub CLI
and have `repo` scope. The draft release is left unpublished — review it and hit "Publish" on
GitHub before end users' apps will actually see it as an update.
