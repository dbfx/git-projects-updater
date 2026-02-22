import { AppSettings, PersistedState } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  distro: "",
  pullBeforeUpdate: true,
  autoCommit: true,
  autoPush: true,
  retryCount: 3,
  retryDelayMs: 2000,
  commitMessage: "chore: update dependencies [skip ci]",
  ensureLineEndings: true,
  tools: {
    composer: true,
    npm: true,
    pnpm: true,
    yarn: true,
    pip: true
  }
};

export const DEFAULT_STATE: PersistedState = {
  settings: DEFAULT_SETTINGS,
  roots: [],
  projectPreferences: {},
  projects: [],
  history: []
};
