import { DiscoveredProject, JsManager, ProjectManifests, ProjectPreference, ScanRoot, ScanResult } from "../../shared/types";
import { basename, normalizeWslPath, projectIdFromPath, shellEscape } from "../lib/utils";
import { executeWslCommand } from "./wslExecutor";

export function detectJsManager(manifests: ProjectManifests): JsManager {
  if (!manifests.packageJson) {
    return "none";
  }
  if (manifests.pnpmLock) {
    return "pnpm";
  }
  if (manifests.yarnLock) {
    return "yarn";
  }
  return "npm";
}

export function shouldExcludePath(root: ScanRoot, path: string): boolean {
  const normalized = normalizeWslPath(path);
  if (root.exclusionsByPath.includes(normalized)) {
    return true;
  }

  for (const excludedPath of root.exclusionsByPath) {
    if (normalized.startsWith(`${excludedPath}/`)) {
      return true;
    }
  }

  const name = basename(normalized);
  return root.exclusionsByName.includes(name);
}

function deriveSkipReason(project: DiscoveredProject): string | undefined {
  if (project.cleanState === "dirty") {
    return "Repository has uncommitted changes";
  }
  return undefined;
}

function parseInspectorOutput(stdout: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const [key, ...rest] = line.split("=");
    if (!key || rest.length === 0) {
      continue;
    }
    result[key.trim()] = rest.join("=").trim();
  }
  return result;
}

function asBool(value: string | undefined): boolean {
  return value === "1";
}

async function listDirectories(distro: string, root: ScanRoot, signal?: AbortSignal): Promise<string[]> {
  const cmd = `
if [ ! -d ${shellEscape(root.wslPath)} ]; then
  echo "Root path does not exist: ${root.wslPath}" 1>&2
  exit 3
fi
find ${shellEscape(root.wslPath)} -mindepth 0 -maxdepth ${root.maxDepth} -type d 2>/dev/null
`;
  const outcome = await executeWslCommand({ distro, command: cmd, signal });
  if (outcome.code !== 0) {
    throw new Error(
      `Failed to scan root ${root.wslPath} in distro '${distro}'. ${outcome.stderr.trim() || "Unknown WSL error."}`
    );
  }
  return outcome.stdout
    .split(/\r?\n/)
    .map((entry) => normalizeWslPath(entry))
    .filter(Boolean);
}

async function inspectDirectory(
  distro: string,
  root: ScanRoot,
  directoryPath: string,
  preference: ProjectPreference | undefined,
  signal?: AbortSignal
): Promise<DiscoveredProject | null> {
  const inspectScript = `
if [ -f composer.json ]; then echo "composer=1"; else echo "composer=0"; fi
if [ -f package.json ]; then echo "package=1"; else echo "package=0"; fi
if [ -f pnpm-lock.yaml ]; then echo "pnpm=1"; else echo "pnpm=0"; fi
if [ -f yarn.lock ]; then echo "yarn=1"; else echo "yarn=0"; fi
if [ -f package-lock.json ]; then echo "packageLock=1"; else echo "packageLock=0"; fi
if [ -f requirements.in ]; then echo "requirementsIn=1"; else echo "requirementsIn=0"; fi
if [ -f requirements.txt ]; then echo "requirementsTxt=1"; else echo "requirementsTxt=0"; fi
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "git=1"
  printf "branch="; git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""
  if git -c core.fileMode=false diff --ignore-submodules --quiet -w HEAD; then
    echo "clean=1"
  else
    echo "clean=0"
  fi
else
  echo "git=0"
  echo "branch="
  echo "clean=-1"
fi
`;

  const inspected = await executeWslCommand({
    distro,
    command: inspectScript,
    cwd: directoryPath,
    signal
  });

  if (inspected.code !== 0) {
    return null;
  }

  const parsed = parseInspectorOutput(inspected.stdout);
  const manifests: ProjectManifests = {
    composerJson: asBool(parsed.composer),
    packageJson: asBool(parsed.package),
    pnpmLock: asBool(parsed.pnpm),
    yarnLock: asBool(parsed.yarn),
    packageLock: asBool(parsed.packageLock),
    requirementsIn: asBool(parsed.requirementsIn),
    requirementsTxt: asBool(parsed.requirementsTxt)
  };

  if (
    !manifests.composerJson &&
    !manifests.packageJson &&
    !manifests.requirementsIn &&
    !manifests.requirementsTxt
  ) {
    return null;
  }

  if (!asBool(parsed.git)) {
    return null;
  }

  const project: DiscoveredProject = {
    id: projectIdFromPath(root.id, directoryPath),
    rootId: root.id,
    name: basename(directoryPath),
    wslPath: directoryPath,
    manifests,
    isGitRepo: asBool(parsed.git),
    branch: parsed.branch || null,
    cleanState: parsed.clean === "1" ? "clean" : parsed.clean === "0" ? "dirty" : "unknown",
    enabled: preference?.enabled ?? true,
    jsManager: detectJsManager(manifests)
  };

  project.skipReason = deriveSkipReason(project);
  return project;
}

export class ScannerService {
  private activeController: AbortController | null = null;

  async startScan(
    distro: string,
    roots: ScanRoot[],
    preferences: Record<string, ProjectPreference>
  ): Promise<ScanResult> {
    this.activeController = new AbortController();
    const signal = this.activeController.signal;
    const projects: DiscoveredProject[] = [];

    try {
      const enabledRoots = roots.filter((root) => root.enabled);
      for (const root of enabledRoots) {
        const paths = await listDirectories(distro, root, signal);
        for (const dirPath of paths) {
          if (signal.aborted) {
            throw new Error("Scan cancelled");
          }

          if (shouldExcludePath(root, dirPath)) {
            continue;
          }

          const probeProjectId = projectIdFromPath(root.id, dirPath);
          const project = await inspectDirectory(
            distro,
            root,
            dirPath,
            preferences[probeProjectId],
            signal
          );
          if (project) {
            projects.push(project);
          }
        }
      }

      projects.sort((a, b) => {
        const byName = a.name.localeCompare(b.name);
        if (byName !== 0) {
          return byName;
        }
        return a.wslPath.localeCompare(b.wslPath);
      });

      return {
        projects,
        scannedAt: new Date().toISOString()
      };
    } finally {
      this.activeController = null;
    }
  }

  cancelScan(): boolean {
    if (!this.activeController) {
      return false;
    }
    this.activeController.abort();
    this.activeController = null;
    return true;
  }
}
