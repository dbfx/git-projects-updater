import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { UpdateState } from "../../shared/types";

let mainWindow: BrowserWindow | null = null;

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

function send(state: UpdateState): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update:status", state);
  }
}

export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    send({ status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    send({ status: "available", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    send({ status: "not-available" });
  });

  autoUpdater.on("download-progress", (progress) => {
    send({ status: "downloading", progress: Math.round(progress.percent) });
  });

  autoUpdater.on("update-downloaded", (info) => {
    send({ status: "ready", version: info.version });
  });

  autoUpdater.on("error", (err) => {
    send({ status: "error", error: err.message });
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, CHECK_INTERVAL_MS);
  }
}

export function checkForUpdates(): Promise<void> {
  return autoUpdater.checkForUpdates().then(() => {});
}

export function downloadUpdate(): Promise<void> {
  return autoUpdater.downloadUpdate().then(() => {});
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
