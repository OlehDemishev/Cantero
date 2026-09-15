import { contextBridge } from "electron";

/**
 * Runs in an isolated context alongside the loaded web app (contextIsolation: true), so this is
 * the only safe place to hand anything from the Electron/Node world to the page — nodeIntegration
 * stays off in the renderer itself. Nothing the web app needs yet beyond knowing it's running
 * inside the desktop shell; extend this bridge (and the matching main-process ipcMain handlers)
 * as real native integrations come up, rather than ever turning nodeIntegration on.
 */
contextBridge.exposeInMainWorld("cantero", {
  isDesktopApp: true,
  versions: process.versions,
});
