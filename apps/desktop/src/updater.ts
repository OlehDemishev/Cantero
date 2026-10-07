import { autoUpdater } from "electron-updater";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // every 4 hours while the app stays open

/**
 * Checks GitHub Releases (see electron-builder.yml's `publish` block) for a newer version,
 * downloads it in the background, and — once fully downloaded — shows a native OS notification;
 * clicking it (or the next time the app quits) installs and relaunches. checkForUpdatesAndNotify()
 * owns that whole flow; this module just decides *when* to call it and logs what happened, rather
 * than reimplementing any of it.
 *
 * A no-op in dev (`app.isPackaged` is false for `electron .`) — there's no packaged app for
 * electron-updater to replace, and GitHub Releases won't have a dev build published anyway.
 */
export function startAutoUpdater(): void {
  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => console.log("[updater] checking for update…"));
  autoUpdater.on("update-available", (info) => console.log(`[updater] update available: ${info.version}`));
  autoUpdater.on("update-not-available", () => console.log("[updater] already on the latest version"));
  autoUpdater.on("download-progress", (progress) => console.log(`[updater] downloading: ${Math.round(progress.percent)}%`));
  autoUpdater.on("update-downloaded", (info) => console.log(`[updater] update ${info.version} downloaded, will install on quit`));
  // A failed check (offline, GitHub unreachable, no release published yet) is never fatal to the
  // running app — there's always the current version to keep using.
  autoUpdater.on("error", (err) => console.error("[updater] check failed:", err));

  const check = () => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error("[updater] checkForUpdatesAndNotify failed:", err));
  };

  check();
  setInterval(check, CHECK_INTERVAL_MS);
}
