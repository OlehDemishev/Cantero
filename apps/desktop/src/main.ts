import { app, BrowserWindow, Menu, shell } from "electron";
import path from "node:path";
import { autoUpdater } from "electron-updater";
import { buildMenu } from "./menu";

// No fallback to a guessed production domain here on purpose — until a real one is configured,
// the honest default is the local dev server this whole app is actually built and tested
// against. Packaging for a real deployment must set CANTERO_APP_URL explicitly (see .env.example).
const APP_URL = process.env.CANTERO_APP_URL ?? "http://localhost:3000";

let mainWindow: BrowserWindow | null = null;

// electron-builder embeds the right icon into the packaged app/installer on its own (win.icon /
// mac.icon in electron-builder.yml) — this is only for the BrowserWindow's own icon (window/
// taskbar on Windows, ~unused on macOS) and the Dock icon while running unpackaged in dev, where
// there's no app bundle yet to pull one from. .ico is a Windows format; macOS wants .icns.
const ICON_PATH = path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.icns");

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url).origin === new URL(APP_URL).origin;
  } catch {
    return false;
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "Cantero",
    icon: ICON_PATH,
    backgroundColor: "#0b0f19",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // The loaded page is remote web content (this app's own web frontend, but still content
      // fetched over the network) — treat it exactly like a browser tab would: no Node access,
      // isolated context, sandboxed renderer. Enabling nodeIntegration here would turn any XSS
      // in the web app into full code execution on the user's machine instead of "just" a
      // browser-tab-scoped XSS.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Anything that isn't the app's own origin (a Stripe checkout redirect, a mailto: link, "open
  // in browser" style links, an SSO IdP page) opens in the OS's default browser instead of
  // navigating this window away from Cantero or spawning a bare, chrome-less Electron popup.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSameOrigin(url)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isSameOrigin(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(APP_URL);
}

// Second launch (double-clicking the app, or a system file/protocol handoff later) focuses the
// existing window instead of opening a duplicate one.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    // Only meaningful unpackaged (dev): a packaged .app already carries its icon in the bundle
    // itself. app.dock is undefined outside macOS.
    if (!app.isPackaged) app.dock?.setIcon(ICON_PATH);

    Menu.setApplicationMenu(buildMenu());
    createWindow();

    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {
        // Best-effort: no update feed configured yet is not a reason to disrupt startup.
      });
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
