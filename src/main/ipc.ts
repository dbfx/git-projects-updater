import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { DEFAULT_SETTINGS } from "../shared/defaults";
import { AppSettings, RunRequest, ScanRoot } from "../shared/types";
import { isWslPath, normalizeWslPath, rootId } from "./lib/utils";
import { buildPreviewActions } from "./services/plannerService";
import { ScannerService } from "./services/scannerService";
import { RunnerService } from "./services/runnerService";
import { stateStore } from "./services/stateStore";
import { listWslDistros } from "./services/wslService";

const scannerService = new ScannerService();
const runnerService = new RunnerService();

function eventSink(window: BrowserWindow) {
  return (channel: string, payload: unknown) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  };
}

function validatedDepth(value: number | undefined): 1 | 2 | 3 {
  if (value === 2 || value === 3) {
    return value;
  }
  return 1;
}

function normalizeRootInput(input: Omit<ScanRoot, "id">): Omit<ScanRoot, "id"> {
  if (!isWslPath(input.wslPath)) {
    throw new Error("Root path must be a WSL path (e.g. /home/user/projects)");
  }
  return {
    ...input,
    wslPath: normalizeWslPath(input.wslPath),
    maxDepth: validatedDepth(input.maxDepth),
    exclusionsByName: input.exclusionsByName.map((value) => value.trim()).filter(Boolean),
    exclusionsByPath: input.exclusionsByPath
      .map((value) => normalizeWslPath(value))
      .filter(Boolean)
  };
}

function getEffectiveSettings(patch?: Partial<AppSettings>): AppSettings {
  const current = stateStore.getSettings();
  if (!patch) {
    return current;
  }
  return {
    ...current,
    ...patch,
    tools: {
      ...current.tools,
      ...(patch.tools ?? {})
    }
  };
}

function resolveConfiguredDistro(settings: AppSettings): string {
  const distros = listWslDistros();
  if (distros.length === 0) {
    throw new Error("No WSL distros detected. Install a distro and try again.");
  }

  if (settings.distro) {
    if (!distros.some((entry) => entry.name === settings.distro)) {
      throw new Error(
        `Configured distro '${settings.distro}' was not found. Available: ${distros
          .map((entry) => entry.name)
          .join(", ")}`
      );
    }
    return settings.distro;
  }

  const selected = distros.find((entry) => entry.isDefault)?.name ?? distros[0].name;
  stateStore.updateSettings({ distro: selected });
  return selected;
}

export function registerIpcHandlers(window: BrowserWindow): void {
  const emit = eventSink(window);

  ipcMain.handle("settings:get", async () => {
    return stateStore.getSettings();
  });

  ipcMain.handle("settings:update", async (_event, patch: Partial<AppSettings>) => {
    return stateStore.updateSettings(patch);
  });

  ipcMain.handle("roots:list", async () => {
    return stateStore.getRoots();
  });

  ipcMain.handle("roots:add", async (_event, root: Omit<ScanRoot, "id">) => {
    const normalized = normalizeRootInput(root);
    const roots = stateStore.getRoots();
    const next: ScanRoot = {
      ...normalized,
      id: rootId()
    };
    roots.push(next);
    stateStore.setRoots(roots);
    return next;
  });

  ipcMain.handle("roots:update", async (_event, id: string, patch: Partial<ScanRoot>) => {
    const roots = stateStore.getRoots();
    const index = roots.findIndex((root) => root.id === id);
    if (index === -1) {
      return null;
    }

    const current = roots[index];
    const merged: Omit<ScanRoot, "id"> = normalizeRootInput({
      wslPath: patch.wslPath ?? current.wslPath,
      maxDepth: validatedDepth(patch.maxDepth ?? current.maxDepth),
      enabled: patch.enabled ?? current.enabled,
      exclusionsByName: patch.exclusionsByName ?? current.exclusionsByName,
      exclusionsByPath: patch.exclusionsByPath ?? current.exclusionsByPath
    });
    roots[index] = {
      id,
      ...merged
    };
    stateStore.setRoots(roots);
    return roots[index];
  });

  ipcMain.handle("roots:remove", async (_event, id: string) => {
    const roots = stateStore.getRoots();
    const next = roots.filter((root) => root.id !== id);
    if (next.length === roots.length) {
      return false;
    }
    stateStore.setRoots(next);
    return true;
  });

  ipcMain.handle("projects:get", async () => {
    return stateStore.getProjects();
  });

  ipcMain.handle("projects:updatePreferences", async (_event, projectId: string, preference) => {
    return stateStore.setProjectPreference(projectId, preference);
  });

  ipcMain.handle("scan:start", async () => {
    const settings = stateStore.getSettings();
    const distro = resolveConfiguredDistro(settings);
    const result = await scannerService.startScan(
      distro,
      stateStore.getRoots(),
      stateStore.getProjectPreferences()
    );
    stateStore.setProjects(result.projects);
    return result;
  });

  ipcMain.handle("scan:cancel", async () => {
    return scannerService.cancelScan();
  });

  ipcMain.handle("run:preview", async (_event, request: RunRequest) => {
    const settings = getEffectiveSettings(request.effectiveSettings);
    return buildPreviewActions(
      stateStore.getProjects(),
      stateStore.getProjectPreferences(),
      settings,
      request
    );
  });

  ipcMain.handle("run:start", async (_event, request: RunRequest) => {
    const settings = getEffectiveSettings(request.effectiveSettings);
    const distro = resolveConfiguredDistro(settings);
    const projects = stateStore.getProjects();
    const actions = buildPreviewActions(
      projects,
      stateStore.getProjectPreferences(),
      settings,
      request
    );
    const summary = await runnerService.start({
      distro,
      actions,
      projects,
      settings,
      logDirectory: path.join(app.getPath("userData"), "logs"),
      onEvent: (event) => emit("run:event", event)
    });
    stateStore.appendHistory(summary);
    return summary;
  });

  ipcMain.handle("run:cancel", async () => {
    return runnerService.cancel();
  });

  ipcMain.handle("run:status", async () => {
    return runnerService.getStatus();
  });

  ipcMain.handle("history:list", async () => {
    return stateStore.getHistory();
  });

  ipcMain.handle("history:get", async (_event, runId: string) => {
    return stateStore.getHistory().find((entry) => entry.runId === runId) ?? null;
  });

  ipcMain.handle("history:clear", async () => {
    stateStore.clearHistory();
    return true;
  });

  ipcMain.handle("wsl:listDistros", async () => {
    return listWslDistros();
  });

  ipcMain.handle("app:defaults", async () => DEFAULT_SETTINGS);
}

export function unregisterIpcHandlers(): void {
  const channels = [
    "settings:get",
    "settings:update",
    "roots:list",
    "roots:add",
    "roots:update",
    "roots:remove",
    "projects:get",
    "projects:updatePreferences",
    "scan:start",
    "scan:cancel",
    "run:preview",
    "run:start",
    "run:cancel",
    "run:status",
    "history:list",
    "history:get",
    "history:clear",
    "wsl:listDistros",
    "app:defaults"
  ];

  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }
}
