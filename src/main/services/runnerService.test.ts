import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSettings, DiscoveredProject, PlannedAction } from "../../shared/types";
import { RunnerService } from "./runnerService";

const executeWslCommandMock = vi.fn();

vi.mock("./wslExecutor", () => ({
  executeWslCommand: (...args: unknown[]) => executeWslCommandMock(...args)
}));

function makeProject(): DiscoveredProject {
  return {
    id: "p1",
    rootId: "r1",
    name: "api",
    wslPath: "/home/fx/api",
    manifests: {
      composerJson: true,
      packageJson: false,
      pnpmLock: false,
      yarnLock: false,
      packageLock: false,
      requirementsIn: false,
      requirementsTxt: false
    },
    isGitRepo: true,
    branch: "main",
    cleanState: "clean",
    enabled: true,
    jsManager: "none"
  };
}

const settings: AppSettings = {
  distro: "Ubuntu",
  pullBeforeUpdate: true,
  autoCommit: true,
  autoPush: true,
  retryCount: 3,
  retryDelayMs: 1,
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

describe("RunnerService", () => {
  beforeEach(() => {
    executeWslCommandMock.mockReset();
  });

  it("runs with push conflict recovery", async () => {
    let pushCalls = 0;
    executeWslCommandMock.mockImplementation(async (input: { command: string }) => {
      if (input.command.includes("echo \"ok=1\"")) {
        return { code: 0, stdout: "branch=main\nok=1\n", stderr: "" };
      }
      if (input.command.startsWith("git -c core.fileMode=false diff --cached")) {
        return { code: 1, stdout: "", stderr: "" };
      }
      if (input.command.startsWith("git push origin")) {
        pushCalls += 1;
        return { code: pushCalls === 1 ? 1 : 0, stdout: "", stderr: "" };
      }
      if (input.command.startsWith("git pull --rebase")) {
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    });

    const runner = new RunnerService();
    const action: PlannedAction = {
      projectId: "p1",
      projectName: "api",
      projectPath: "/home/fx/api",
      skipReasons: [],
      commands: [
        { label: "Git pull", command: "git pull --ff-only origin main", retriable: true },
        { label: "Composer update", command: "composer update --quiet", retriable: true },
        { label: "Stage changes", command: "git add -A" },
        { label: "Check staged diff", command: "git -c core.fileMode=false diff --cached --quiet -w" },
        { label: "Commit", command: "git commit -m \"chore: update dependencies [skip ci]\"" },
        { label: "Push", command: "git push origin main", retriable: true }
      ]
    };

    const summary = await runner.start({
      distro: "Ubuntu",
      actions: [action],
      projects: [makeProject()],
      settings,
      logDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "gpu-runner-test-")),
      onEvent: () => {}
    });

    expect(summary.counts.success).toBe(1);
    expect(summary.counts.failed).toBe(0);
    expect(pushCalls).toBe(2);
  });

  it("skips pre-marked action", async () => {
    const runner = new RunnerService();
    const summary = await runner.start({
      distro: "Ubuntu",
      actions: [
        {
          projectId: "p1",
          projectName: "api",
          projectPath: "/home/fx/api",
          skipReasons: ["Project disabled"],
          commands: []
        }
      ],
      projects: [makeProject()],
      settings,
      logDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "gpu-runner-test-")),
      onEvent: () => {}
    });
    expect(summary.counts.skipped).toBe(1);
  });

  it("rechecks pnpm safety after pull and refuses the package update if lockfiles changed", async () => {
    const project: DiscoveredProject = {
      ...makeProject(),
      manifests: {
        composerJson: false,
        packageJson: true,
        pnpmLock: true,
        yarnLock: false,
        packageLock: false,
        requirementsIn: false,
        requirementsTxt: false
      },
      jsManager: "pnpm"
    };
    let pnpmSafetyChecks = 0;
    let pnpmUpdateCalls = 0;

    executeWslCommandMock.mockImplementation(async (input: { command: string }) => {
      if (input.command.includes("[ -f pnpm-lock.yaml ]")) {
        pnpmSafetyChecks += 1;
        return pnpmSafetyChecks === 1
          ? { code: 0, stdout: "", stderr: "" }
          : {
              code: 42,
              stdout: "",
              stderr: "Refusing update: competing package-manager lockfile(s): package-lock.json"
            };
      }
      if (input.command.includes('echo "ok=1"')) {
        return { code: 0, stdout: "branch=main\nok=1\n", stderr: "" };
      }
      if (input.command.startsWith("pnpm update")) {
        pnpmUpdateCalls += 1;
      }
      return { code: 0, stdout: "", stderr: "" };
    });

    const action: PlannedAction = {
      projectId: project.id,
      projectName: project.name,
      projectPath: project.wslPath,
      skipReasons: [],
      commands: [
        { label: "Git pull", command: "git pull --ff-only origin main", retriable: true },
        {
          label: "Verify pnpm project",
          command:
            '[ -f pnpm-lock.yaml ] || exit 42; [ ! -f package-lock.json ] || exit 42'
        },
        { label: "pnpm update", command: "pnpm update --latest --no-frozen-lockfile" }
      ]
    };

    const summary = await new RunnerService().start({
      distro: "Ubuntu",
      actions: [action],
      projects: [project],
      settings,
      logDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "gpu-runner-test-")),
      onEvent: () => {}
    });

    expect(pnpmSafetyChecks).toBe(2);
    expect(pnpmUpdateCalls).toBe(0);
    expect(summary.counts.failed).toBe(1);
    expect(summary.results[0].reason).toBe("Verify pnpm project failed");
  });
});
