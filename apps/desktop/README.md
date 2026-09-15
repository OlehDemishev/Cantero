# Cantero Desktop

An Electron shell around the existing Cantero web app (`apps/web`) — no separate frontend, this
just wraps the same web app in native window/menu chrome. First packaged target is Windows
(NSIS installer); the code itself is cross-platform and a macOS build can follow later without
changes here.

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

## Building the Windows installer

```bash
pnpm --filter @cantero/desktop dist:win
```

Output lands in `apps/desktop/release/`. Cross-building the NSIS installer from macOS/Linux needs
`wine` installed (electron-builder shells out to it); building on an actual Windows machine or a
Windows CI runner avoids that dependency entirely and is the more reliable option.

Before packaging a build meant for real users, set `CANTERO_APP_URL` (in the environment the build
runs in, not just `.env` — see `electron-builder.yml`'s `files` list, `.env` isn't bundled into the
app) to the actual deployed web app URL. There's no baked-in production default on purpose.

## Auto-updates

`electron-updater` is wired up in `main.ts` but has no update feed configured yet
(`electron-builder.yml`'s `publish: null`) — there's nothing to check against until releases are
actually published somewhere (GitHub Releases, or a generic HTTP feed). Set `publish` accordingly
when that exists.
