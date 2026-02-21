export type DepthSetting = 1 | 2 | 3;
export type BranchName = "main" | "master";
export type JsManager = "npm" | "pnpm" | "yarn" | "none";
export type RunState = "idle" | "running" | "cancelling";
export type ProjectStatus = "success" | "failed" | "skipped" | "cancelled";
export type EventLevel = "info" | "success" | "warning" | "error";

export interface ToolToggles {
  composer: boolean;
  npm: boolean;
  pnpm: boolean;
  yarn: boolean;
  pip: boolean;
}

export interface AppSettings {
  distro: string;
  pullBeforeUpdate: boolean;
  autoCommit: boolean;
  autoPush: boolean;
  retryCount: number;
  retryDelayMs: number;
  commitMessage: string;
  tools: ToolToggles;
}

export interface ScanRoot {
  id: string;
  wslPath: string;
  maxDepth: DepthSetting;
  enabled: boolean;
  exclusionsByName: string[];
  exclusionsByPath: string[];
}

export interface ProjectManifests {
  composerJson: boolean;
  packageJson: boolean;
  pnpmLock: boolean;
  yarnLock: boolean;
  packageLock: boolean;
  requirementsIn: boolean;
  requirementsTxt: boolean;
}

export interface ProjectPreference {
  enabled: boolean;
  tools?: Partial<ToolToggles>;
}

export interface DiscoveredProject {
  id: string;
  rootId: string;
  name: string;
  wslPath: string;
  manifests: ProjectManifests;
  isGitRepo: boolean;
  branch: string | null;
  cleanState: "clean" | "dirty" | "unknown";
  enabled: boolean;
  jsManager: JsManager;
  skipReason?: string;
}

export interface EffectiveProjectTools extends ToolToggles {}

export interface PlannedCommand {
  label: string;
  command: string;
  retriable?: boolean;
}

export interface PlannedAction {
  projectId: string;
  projectName: string;
  projectPath: string;
  commands: PlannedCommand[];
  skipReasons: string[];
}

export interface RunRequest {
  selectedProjectIds: string[];
  effectiveSettings?: Partial<AppSettings>;
  gitWriteMode?: "auto_push" | "commit_only" | "no_commit";
  confirmationHash?: string;
}

export interface RunEvent {
  runId: string;
  timestamp: string;
  projectId?: string;
  projectName?: string;
  stage: string;
  level: EventLevel;
  message: string;
  stream?: "stdout" | "stderr";
}

export interface ProjectResult {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  reason?: string;
}

export interface RunSummary {
  runId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  counts: {
    success: number;
    failed: number;
    skipped: number;
    cancelled: number;
  };
  results: ProjectResult[];
  logFile: string;
}

export interface RunStatus {
  state: RunState;
  runId?: string;
  currentProjectId?: string;
}

export interface ScanResult {
  projects: DiscoveredProject[];
  scannedAt: string;
}

export interface PersistedState {
  settings: AppSettings;
  roots: ScanRoot[];
  projectPreferences: Record<string, ProjectPreference>;
  projects: DiscoveredProject[];
  history: RunSummary[];
}

export interface RunnerHooks {
  emit(event: RunEvent): void;
}

export interface CommandOutcome {
  code: number;
  stdout: string;
  stderr: string;
  cancelled?: boolean;
}

export interface WslDistro {
  name: string;
  isDefault: boolean;
}

export interface AppApi {
  settings: {
    get: () => Promise<AppSettings>;
    update: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  };
  roots: {
    list: () => Promise<ScanRoot[]>;
    add: (root: Omit<ScanRoot, "id">) => Promise<ScanRoot>;
    update: (id: string, patch: Partial<ScanRoot>) => Promise<ScanRoot | null>;
    remove: (id: string) => Promise<boolean>;
  };
  projects: {
    get: () => Promise<DiscoveredProject[]>;
    updatePreferences: (
      projectId: string,
      preference: ProjectPreference
    ) => Promise<ProjectPreference>;
  };
  scan: {
    start: () => Promise<ScanResult>;
    cancel: () => Promise<boolean>;
  };
  run: {
    preview: (request: RunRequest) => Promise<PlannedAction[]>;
    start: (request: RunRequest) => Promise<RunSummary>;
    cancel: () => Promise<boolean>;
    status: () => Promise<RunStatus>;
    onEvent: (listener: (event: RunEvent) => void) => () => void;
  };
  history: {
    list: () => Promise<RunSummary[]>;
    get: (runId: string) => Promise<RunSummary | null>;
    clear: () => Promise<boolean>;
  };
  wsl: {
    listDistros: () => Promise<WslDistro[]>;
  };
}
