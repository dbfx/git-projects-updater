import Store from "electron-store";
import { DEFAULT_STATE } from "../../shared/defaults";
import {
  AppSettings,
  DiscoveredProject,
  PersistedState,
  ProjectPreference,
  RunSummary,
  ScanRoot
} from "../../shared/types";

class StateStore {
  private readonly store: Store<PersistedState>;

  constructor() {
    this.store = new Store<PersistedState>({
      name: "git-project-updater-state",
      defaults: DEFAULT_STATE
    });
  }

  getSettings(): AppSettings {
    return this.store.get("settings");
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const next: AppSettings = {
      ...current,
      ...patch,
      tools: {
        ...current.tools,
        ...(patch.tools ?? {})
      }
    };
    this.store.set("settings", next);
    return next;
  }

  getRoots(): ScanRoot[] {
    return this.store.get("roots");
  }

  setRoots(roots: ScanRoot[]): void {
    this.store.set("roots", roots);
  }

  getProjectPreferences(): Record<string, ProjectPreference> {
    return this.store.get("projectPreferences");
  }

  setProjectPreference(projectId: string, preference: ProjectPreference): ProjectPreference {
    const current = this.getProjectPreferences();
    current[projectId] = preference;
    this.store.set("projectPreferences", current);
    return preference;
  }

  getProjects(): DiscoveredProject[] {
    return this.store.get("projects");
  }

  setProjects(projects: DiscoveredProject[]): void {
    this.store.set("projects", projects);
  }

  getHistory(): RunSummary[] {
    return this.store.get("history");
  }

  appendHistory(summary: RunSummary): void {
    const next = [summary, ...this.getHistory()].slice(0, 50);
    this.store.set("history", next);
  }

  clearHistory(): void {
    this.store.set("history", []);
  }
}

export const stateStore = new StateStore();
