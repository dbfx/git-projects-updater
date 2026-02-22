import { contextBridge, ipcRenderer } from "electron";
import { AppApi, AppSettings, ProjectPreference, RunRequest, ScanRoot, UpdateState } from "../shared/types";

const api: AppApi = {
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (patch: Partial<AppSettings>) => ipcRenderer.invoke("settings:update", patch)
  },
  roots: {
    list: () => ipcRenderer.invoke("roots:list"),
    add: (root: Omit<ScanRoot, "id">) => ipcRenderer.invoke("roots:add", root),
    update: (id: string, patch: Partial<ScanRoot>) => ipcRenderer.invoke("roots:update", id, patch),
    remove: (id: string) => ipcRenderer.invoke("roots:remove", id)
  },
  projects: {
    get: () => ipcRenderer.invoke("projects:get"),
    updatePreferences: (projectId: string, preference: ProjectPreference) =>
      ipcRenderer.invoke("projects:updatePreferences", projectId, preference)
  },
  scan: {
    start: () => ipcRenderer.invoke("scan:start"),
    cancel: () => ipcRenderer.invoke("scan:cancel")
  },
  run: {
    preview: (request: RunRequest) => ipcRenderer.invoke("run:preview", request),
    start: (request: RunRequest) => ipcRenderer.invoke("run:start", request),
    cancel: () => ipcRenderer.invoke("run:cancel"),
    status: () => ipcRenderer.invoke("run:status"),
    onEvent: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        listener(payload as any);
      };
      ipcRenderer.on("run:event", wrapped);
      return () => {
        ipcRenderer.removeListener("run:event", wrapped);
      };
    }
  },
  history: {
    list: () => ipcRenderer.invoke("history:list"),
    get: (runId: string) => ipcRenderer.invoke("history:get", runId),
    clear: () => ipcRenderer.invoke("history:clear")
  },
  wsl: {
    listDistros: () => ipcRenderer.invoke("wsl:listDistros")
  },
  update: {
    check: () => ipcRenderer.invoke("update:check"),
    download: () => ipcRenderer.invoke("update:download"),
    install: () => ipcRenderer.invoke("update:install"),
    onStatus: (listener: (state: UpdateState) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        listener(payload as UpdateState);
      };
      ipcRenderer.on("update:status", wrapped);
      return () => {
        ipcRenderer.removeListener("update:status", wrapped);
      };
    }
  }
};

contextBridge.exposeInMainWorld("api", api);
