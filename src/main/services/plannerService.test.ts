import { describe, expect, it } from "vitest";
import { AppSettings, DiscoveredProject, RunRequest } from "../../shared/types";
import { buildPreviewActions } from "./plannerService";

function makeProject(partial: Partial<DiscoveredProject>): DiscoveredProject {
  return {
    id: partial.id ?? "id",
    rootId: partial.rootId ?? "root",
    name: partial.name ?? "project",
    wslPath: partial.wslPath ?? "/home/fx/project",
    manifests: partial.manifests ?? {
      composerJson: false,
      packageJson: false,
      pnpmLock: false,
      yarnLock: false,
      packageLock: false,
      requirementsIn: false,
      requirementsTxt: false
    },
    isGitRepo: partial.isGitRepo ?? true,
    branch: partial.branch ?? "main",
    cleanState: partial.cleanState ?? "clean",
    enabled: partial.enabled ?? true,
    jsManager: partial.jsManager ?? "none",
    skipReason: partial.skipReason
  };
}

const settings: AppSettings = {
  distro: "Ubuntu",
  pullBeforeUpdate: true,
  autoCommit: true,
  autoPush: true,
  retryCount: 3,
  retryDelayMs: 2000,
  commitMessage: "chore: update dependencies [skip ci]",
  tools: {
    composer: true,
    npm: true,
    pnpm: true,
    yarn: true,
    pip: true
  }
};

describe("plannerService", () => {
  it("sorts actions deterministically by name/path", () => {
    const actions = buildPreviewActions(
      [
        makeProject({ id: "2", name: "zeta", wslPath: "/home/zeta" }),
        makeProject({ id: "1", name: "alpha", wslPath: "/home/alpha" })
      ],
      {},
      settings,
      { selectedProjectIds: ["1", "2"] } satisfies RunRequest
    );
    expect(actions[0].projectName).toBe("alpha");
    expect(actions[1].projectName).toBe("zeta");
  });

  it("creates package manager commands based on manifests", () => {
    const project = makeProject({
      id: "a",
      name: "web",
      manifests: {
        composerJson: true,
        packageJson: true,
        pnpmLock: true,
        yarnLock: false,
        packageLock: false,
        requirementsIn: true,
        requirementsTxt: false
      },
      jsManager: "pnpm"
    });
    const [action] = buildPreviewActions(
      [project],
      {},
      settings,
      { selectedProjectIds: [project.id] } satisfies RunRequest
    );
    const labels = action.commands.map((command) => command.label);
    expect(labels).toContain("Composer update");
    expect(labels).toContain("pnpm update");
    expect(labels).toContain("pip-compile upgrade");
  });

  it("skips dirty repositories", () => {
    const project = makeProject({
      id: "x",
      branch: "feature/migration",
      cleanState: "dirty"
    });
    const [action] = buildPreviewActions(
      [project],
      {},
      settings,
      { selectedProjectIds: ["x"] } satisfies RunRequest
    );
    expect(action.skipReasons[0]).toContain("uncommitted changes");
    expect(action.commands.length).toBe(0);
  });

  it("allows any branch name", () => {
    const project = makeProject({
      id: "x",
      branch: "feature/migration"
    });
    const [action] = buildPreviewActions(
      [project],
      {},
      settings,
      { selectedProjectIds: ["x"] } satisfies RunRequest
    );
    expect(action.skipReasons.length).toBe(0);
    expect(action.commands.length).toBeGreaterThan(0);
  });
});
