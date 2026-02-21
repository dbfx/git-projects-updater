import { create } from "zustand";
import {
  AppSettings,
  DiscoveredProject,
  PlannedAction,
  RunEvent,
  RunRequest,
  RunStatus,
  RunSummary,
  ScanRoot,
  WslDistro
} from "../../shared/types";

type TabId = "dashboard" | "roots" | "projects" | "preview" | "monitor" | "history" | "settings";

interface AppState {
  initialized: boolean;
  activeTab: TabId;
  settings: AppSettings | null;
  wslDistros: WslDistro[];
  roots: ScanRoot[];
  projects: DiscoveredProject[];
  history: RunSummary[];
  previewActions: PlannedAction[];
  runEvents: RunEvent[];
  runStatus: RunStatus;
  selectedProjectIds: string[];
  busy: {
    loading: boolean;
    scanning: boolean;
    previewing: boolean;
    running: boolean;
  };
  error: string | null;
  runEventUnsubscribe: (() => void) | null;
  initialize: () => Promise<void>;
  setActiveTab: (tab: TabId) => void;
  setError: (error: string | null) => void;
  refreshAll: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  refreshWslDistros: () => Promise<void>;
  addRoot: (root: Omit<ScanRoot, "id">) => Promise<void>;
  updateRoot: (id: string, patch: Partial<ScanRoot>) => Promise<void>;
  removeRoot: (id: string) => Promise<void>;
  startScan: () => Promise<void>;
  toggleProjectEnabled: (projectId: string, enabled: boolean) => Promise<void>;
  selectAllProjects: (enabled: boolean) => void;
  requestPreview: () => Promise<void>;
  startRun: () => Promise<void>;
  cancelRun: () => Promise<void>;
  clearHistory: () => Promise<void>;
}

async function loadInitialState() {
  const distroPromise = window.api.wsl.listDistros().catch(() => [] as WslDistro[]);
  const [settings, roots, projects, history, runStatus, wslDistros] = await Promise.all([
    window.api.settings.get(),
    window.api.roots.list(),
    window.api.projects.get(),
    window.api.history.list(),
    window.api.run.status(),
    distroPromise
  ]);
  return { settings, roots, projects, history, runStatus, wslDistros };
}

function buildRequest(selectedProjectIds: string[]): RunRequest {
  return {
    selectedProjectIds,
    gitWriteMode: "auto_push"
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  activeTab: "dashboard",
  settings: null,
  wslDistros: [],
  roots: [],
  projects: [],
  history: [],
  previewActions: [],
  runEvents: [],
  runStatus: { state: "idle" },
  selectedProjectIds: [],
  busy: {
    loading: false,
    scanning: false,
    previewing: false,
    running: false
  },
  error: null,
  runEventUnsubscribe: null,

  initialize: async () => {
    if (get().initialized) {
      return;
    }
    set((state) => ({ busy: { ...state.busy, loading: true } }));
    try {
      const payload = await loadInitialState();
      const autoDistro =
        payload.settings.distro ||
        payload.wslDistros.find((distro) => distro.isDefault)?.name ||
        payload.wslDistros[0]?.name ||
        "";
      if (autoDistro && autoDistro !== payload.settings.distro) {
        await window.api.settings.update({ distro: autoDistro });
      }
      const selectedProjectIds = payload.projects
        .filter((project) => project.enabled && !project.skipReason)
        .map((project) => project.id);
      const unsubscribe = window.api.run.onEvent((event) => {
        set((state) => ({
          runEvents: [event, ...state.runEvents].slice(0, 500)
        }));
      });
      set({
        initialized: true,
        settings: {
          ...payload.settings,
          distro: autoDistro
        },
        roots: payload.roots,
        projects: payload.projects,
        history: payload.history,
        runStatus: payload.runStatus,
        wslDistros: payload.wslDistros,
        selectedProjectIds,
        runEventUnsubscribe: unsubscribe
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set((state) => ({ busy: { ...state.busy, loading: false } }));
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setError: (error) => set({ error }),

  refreshAll: async () => {
    const payload = await loadInitialState();
    set({
      settings: payload.settings,
      roots: payload.roots,
      projects: payload.projects,
      history: payload.history,
      runStatus: payload.runStatus,
      wslDistros: payload.wslDistros
    });
  },

  updateSettings: async (patch) => {
    const next = await window.api.settings.update(patch);
    set({ settings: next });
  },

  refreshWslDistros: async () => {
    try {
      const distros = await window.api.wsl.listDistros();
      set((state) => {
        const current = state.settings;
        if (!current) {
          return { wslDistros: distros };
        }
        const validCurrent = distros.some((distro) => distro.name === current.distro);
        if (validCurrent || distros.length === 0) {
          return { wslDistros: distros };
        }
        const selected = distros.find((distro) => distro.isDefault)?.name ?? distros[0].name;
        void window.api.settings.update({ distro: selected });
        return {
          wslDistros: distros,
          settings: {
            ...current,
            distro: selected
          }
        };
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  addRoot: async (root) => {
    const created = await window.api.roots.add(root);
    set((state) => ({ roots: [...state.roots, created] }));
  },

  updateRoot: async (id, patch) => {
    const updated = await window.api.roots.update(id, patch);
    if (!updated) {
      return;
    }
    set((state) => ({
      roots: state.roots.map((root) => (root.id === id ? updated : root))
    }));
  },

  removeRoot: async (id) => {
    const ok = await window.api.roots.remove(id);
    if (!ok) {
      return;
    }
    set((state) => ({
      roots: state.roots.filter((root) => root.id !== id)
    }));
  },

  startScan: async () => {
    set((state) => ({ busy: { ...state.busy, scanning: true }, error: null }));
    try {
      const result = await window.api.scan.start();
      set((state) => ({
        projects: result.projects,
        selectedProjectIds: result.projects.filter((project) => project.enabled && !project.skipReason).map((project) => project.id),
        activeTab: "projects"
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set((state) => ({ busy: { ...state.busy, scanning: false } }));
    }
  },

  toggleProjectEnabled: async (projectId, enabled) => {
    const project = get().projects.find((item) => item.id === projectId);
    if (!project) {
      return;
    }

    await window.api.projects.updatePreferences(projectId, {
      enabled
    });

    set((state) => {
      const selected = new Set(state.selectedProjectIds);
      if (enabled) {
        selected.add(projectId);
      } else {
        selected.delete(projectId);
      }
      return {
        projects: state.projects.map((item) =>
          item.id === projectId ? { ...item, enabled } : item
        ),
        selectedProjectIds: Array.from(selected)
      };
    });
  },

  selectAllProjects: (enabled) => {
    set((state) => ({
      selectedProjectIds: enabled ? state.projects.map((project) => project.id) : []
    }));
  },

  requestPreview: async () => {
    set((state) => ({ busy: { ...state.busy, previewing: true }, error: null }));
    try {
      const actions = await window.api.run.preview(buildRequest(get().selectedProjectIds));
      set({
        previewActions: actions,
        activeTab: "preview"
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set((state) => ({ busy: { ...state.busy, previewing: false } }));
    }
  },

  startRun: async () => {
    set((state) => ({
      busy: { ...state.busy, running: true },
      error: null,
      runEvents: [],
      activeTab: "monitor"
    }));
    try {
      const summary = await window.api.run.start(buildRequest(get().selectedProjectIds));
      set((state) => ({
        history: [summary, ...state.history].slice(0, 50),
        activeTab: "history"
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      const status = await window.api.run.status();
      set((state) => ({
        runStatus: status,
        busy: { ...state.busy, running: false }
      }));
    }
  },

  cancelRun: async () => {
    await window.api.run.cancel();
    const status = await window.api.run.status();
    set({ runStatus: status });
  },

  clearHistory: async () => {
    await window.api.history.clear();
    set({ history: [] });
  }
}));

export type { TabId };
