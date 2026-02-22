import { app, BrowserWindow } from "electron";
import path from "node:path";
import { registerIpcHandlers, unregisterIpcHandlers } from "./ipc";
import { initAutoUpdater } from "./services/updaterService";

let mainWindow: BrowserWindow | null = null;

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f5f5f7",
    title: "Git Project Updater",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#fafafa00",
      symbolColor: "#1d1d1f",
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  registerIpcHandlers(mainWindow);
  initAutoUpdater(mainWindow);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(path.resolve(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    unregisterIpcHandlers();
    mainWindow = null;
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.whenReady().then(createMainWindow).catch((error) => {
  console.error("Failed to start app", error);
  app.quit();
});
