import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectPreference, ScanRoot } from "../../shared/types";
import { detectJsManager, ScannerService, shouldExcludePath } from "./scannerService";

const executeWslCommandMock = vi.fn();

vi.mock("./wslExecutor", () => ({
  executeWslCommand: (...args: unknown[]) => executeWslCommandMock(...args)
}));

describe("scannerService helpers", () => {
  it("detects js manager by lockfile priority", () => {
    expect(
      detectJsManager({
        composerJson: false,
        packageJson: true,
        pnpmLock: true,
        yarnLock: true,
        packageLock: true,
        requirementsIn: false,
        requirementsTxt: false
      })
    ).toBe("pnpm");

    expect(
      detectJsManager({
        composerJson: false,
        packageJson: true,
        pnpmLock: false,
        yarnLock: true,
        packageLock: true,
        requirementsIn: false,
        requirementsTxt: false
      })
    ).toBe("yarn");

    expect(
      detectJsManager({
        composerJson: false,
        packageJson: true,
        pnpmLock: false,
        yarnLock: false,
        packageLock: true,
        requirementsIn: false,
        requirementsTxt: false
      })
    ).toBe("npm");
  });

  it("applies exclusions by exact path, descendants, and name", () => {
    const root: ScanRoot = {
      id: "root-1",
      wslPath: "/home/fx/projects",
      maxDepth: 3,
      enabled: true,
      exclusionsByName: ["archive"],
      exclusionsByPath: ["/home/fx/projects/private"]
    };

    expect(shouldExcludePath(root, "/home/fx/projects/private")).toBe(true);
    expect(shouldExcludePath(root, "/home/fx/projects/private/nested")).toBe(true);
    expect(shouldExcludePath(root, "/home/fx/projects/archive")).toBe(true);
    expect(shouldExcludePath(root, "/home/fx/projects/app-one")).toBe(false);
  });
});

describe("ScannerService", () => {
  beforeEach(() => {
    executeWslCommandMock.mockReset();
  });

  it("discovers projects and applies git eligibility reason", async () => {
    const root: ScanRoot = {
      id: "root-1",
      wslPath: "/home/fx/projects",
      maxDepth: 2,
      enabled: true,
      exclusionsByName: [],
      exclusionsByPath: []
    };
    const prefs: Record<string, ProjectPreference> = {};

    executeWslCommandMock.mockImplementation(async (input: { command: string; cwd?: string }) => {
      if (input.command.includes("find ")) {
        return {
          code: 0,
          stdout: "/home/fx/projects\n/home/fx/projects/api\n/home/fx/projects/ui\n",
          stderr: ""
        };
      }

      if (input.cwd === "/home/fx/projects/api") {
        return {
          code: 0,
          stdout: [
            "composer=1",
            "package=0",
            "pnpm=0",
            "yarn=0",
            "packageLock=0",
            "requirementsIn=0",
            "requirementsTxt=0",
            "git=1",
            "branch=main",
            "clean=1"
          ].join("\n"),
          stderr: ""
        };
      }

      if (input.cwd === "/home/fx/projects/ui") {
        return {
          code: 0,
          stdout: [
            "composer=0",
            "package=1",
            "pnpm=0",
            "yarn=1",
            "packageLock=0",
            "requirementsIn=0",
            "requirementsTxt=0",
            "git=1",
            "branch=feature-x",
            "clean=1"
          ].join("\n"),
          stderr: ""
        };
      }

      return {
        code: 0,
        stdout: [
          "composer=0",
          "package=0",
          "pnpm=0",
          "yarn=0",
          "packageLock=0",
          "requirementsIn=0",
          "requirementsTxt=0",
          "git=0",
          "branch=",
          "clean=-1"
        ].join("\n"),
        stderr: ""
      };
    });

    const scanner = new ScannerService();
    const result = await scanner.startScan("Ubuntu", [root], prefs);
    expect(result.projects.length).toBe(2);
    expect(result.projects[0].name).toBe("api");
    expect(result.projects[0].skipReason).toBeUndefined();
    expect(result.projects[1].jsManager).toBe("yarn");
    expect(result.projects[1].skipReason).toBeUndefined();
  });

  it("throws explicit scan error when root lookup fails", async () => {
    const root: ScanRoot = {
      id: "root-1",
      wslPath: "/home/fx/missing",
      maxDepth: 1,
      enabled: true,
      exclusionsByName: [],
      exclusionsByPath: []
    };

    executeWslCommandMock.mockResolvedValue({
      code: 3,
      stdout: "",
      stderr: "Root path does not exist: /home/fx/missing"
    });

    const scanner = new ScannerService();
    await expect(scanner.startScan("Ubuntu", [root], {})).rejects.toThrow(
      "Failed to scan root /home/fx/missing"
    );
  });
});
