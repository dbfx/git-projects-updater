import fs from "node:fs";
import path from "node:path";
import {
  AppSettings,
  DiscoveredProject,
  PlannedAction,
  PlannedCommand,
  ProjectResult,
  RunEvent,
  RunStatus,
  RunSummary
} from "../../shared/types";
import { sleep } from "../lib/utils";
import { executeWslCommand } from "./wslExecutor";

interface StartRunInput {
  distro: string;
  actions: PlannedAction[];
  projects: DiscoveredProject[];
  settings: AppSettings;
  logDirectory: string;
  onEvent: (event: RunEvent) => void;
}

interface ValidationResult {
  ok: boolean;
  reason?: string;
  branch?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeEvent(
  runId: string,
  projectId: string | undefined,
  projectName: string | undefined,
  stage: string,
  level: RunEvent["level"],
  message: string,
  stream?: "stdout" | "stderr"
): RunEvent {
  return {
    runId,
    timestamp: nowIso(),
    projectId,
    projectName,
    stage,
    level,
    message,
    stream
  };
}

async function validateProjectState(
  distro: string,
  projectPath: string,
  signal?: AbortSignal
): Promise<ValidationResult> {
  const script = `
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ok=0"
  echo "reason=Not a git repository"
  exit 0
fi
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
echo "branch=$branch"
if ! git -c core.fileMode=false diff --ignore-submodules --quiet -w HEAD; then
  echo "ok=0"
  echo "reason=Repository has uncommitted changes"
  exit 0
fi
echo "ok=1"
`;

  const outcome = await executeWslCommand({
    distro,
    command: script,
    cwd: projectPath,
    signal
  });

  if (outcome.code !== 0) {
    return { ok: false, reason: "Git validation command failed" };
  }

  const parsed = Object.fromEntries(
    outcome.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key.trim(), rest.join("=").trim()];
      })
  );

  return {
    ok: parsed.ok === "1",
    reason: parsed.reason,
    branch: parsed.branch
  };
}

export class RunnerService {
  private status: RunStatus = { state: "idle" };
  private controller: AbortController | null = null;

  getStatus(): RunStatus {
    return { ...this.status };
  }

  cancel(): boolean {
    if (!this.controller) {
      return false;
    }
    this.status = { ...this.status, state: "cancelling" };
    this.controller.abort();
    return true;
  }

  async start(input: StartRunInput): Promise<RunSummary> {
    if (this.status.state !== "idle") {
      throw new Error("A run is already in progress");
    }

    const startedAt = nowIso();
    const runId = `run-${Date.now()}`;
    const results: ProjectResult[] = [];
    const projectById = new Map(input.projects.map((project) => [project.id, project]));
    const logFile = path.join(input.logDirectory, `${runId}.log`);
    fs.mkdirSync(input.logDirectory, { recursive: true });
    const logStream = fs.createWriteStream(logFile, { flags: "a" });

    const emit = (event: RunEvent): void => {
      input.onEvent(event);
      logStream.write(`${event.timestamp} [${event.level}] [${event.stage}] ${event.message}\n`);
    };

    this.controller = new AbortController();
    this.status = { state: "running", runId };

    const executeWithRetry = async (
      projectId: string,
      projectName: string,
      projectPath: string,
      command: PlannedCommand
    ) => {
      const attempts = Math.max(1, input.settings.retryCount);
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (this.controller?.signal.aborted) {
          return { ok: false, cancelled: true };
        }

        emit(
          makeEvent(
            runId,
            projectId,
            projectName,
            command.label,
            "info",
            `Running: ${command.command}`
          )
        );

        const outcome = await executeWslCommand({
          distro: input.distro,
          command: command.command,
          cwd: projectPath,
          signal: this.controller?.signal,
          onStdout: (line) => {
            if (line.trim()) {
              emit(makeEvent(runId, projectId, projectName, command.label, "info", line, "stdout"));
            }
          },
          onStderr: (line) => {
            if (line.trim()) {
              emit(makeEvent(runId, projectId, projectName, command.label, "warning", line, "stderr"));
            }
          }
        });

        if (outcome.cancelled) {
          return { ok: false, cancelled: true };
        }

        if (command.label === "Check staged diff") {
          return {
            ok: true,
            code: outcome.code,
            hasDiff: outcome.code !== 0
          };
        }

        if (outcome.code === 0) {
          return { ok: true };
        }

        const canRetry = command.retriable && attempt < attempts;
        if (!canRetry) {
          return { ok: false, code: outcome.code };
        }

        emit(
          makeEvent(
            runId,
            projectId,
            projectName,
            command.label,
            "warning",
            `Attempt ${attempt}/${attempts} failed, retrying in ${input.settings.retryDelayMs}ms`
          )
        );
        await sleep(input.settings.retryDelayMs);
      }

      return { ok: false };
    };

    try {
      for (const action of input.actions) {
        const project = projectById.get(action.projectId);
        if (!project) {
          results.push({
            projectId: action.projectId,
            projectName: action.projectName,
            status: "skipped",
            reason: "Project metadata missing"
          });
          continue;
        }

        this.status.currentProjectId = project.id;

        if (this.controller?.signal.aborted) {
          results.push({
            projectId: project.id,
            projectName: project.name,
            status: "cancelled",
            reason: "Run cancelled"
          });
          continue;
        }

        if (action.skipReasons.length > 0) {
          const reason = action.skipReasons.join("; ");
          emit(makeEvent(runId, project.id, project.name, "project", "warning", `Skipped: ${reason}`));
          results.push({
            projectId: project.id,
            projectName: project.name,
            status: "skipped",
            reason
          });
          continue;
        }

        const validation = await validateProjectState(
          input.distro,
          project.wslPath,
          this.controller?.signal
        );
        if (!validation.ok) {
          const reason = validation.reason ?? "Validation failed";
          emit(makeEvent(runId, project.id, project.name, "validate", "warning", reason));
          results.push({
            projectId: project.id,
            projectName: project.name,
            status: "skipped",
            reason
          });
          continue;
        }

        let hasChanges = true;
        let failedReason: string | undefined;
        for (const command of action.commands) {
          if (this.controller?.signal.aborted) {
            failedReason = "Run cancelled";
            break;
          }

          if (!hasChanges && (command.label === "Commit" || command.label === "Push")) {
            continue;
          }

          const outcome = await executeWithRetry(project.id, project.name, project.wslPath, command);
          if (outcome.cancelled) {
            failedReason = "Run cancelled";
            break;
          }

          if (command.label === "Check staged diff") {
            hasChanges = Boolean(outcome.hasDiff);
            if (!hasChanges) {
              emit(
                makeEvent(
                  runId,
                  project.id,
                  project.name,
                  "git",
                  "info",
                  "No staged changes detected, skipping commit/push"
                )
              );
            }
            continue;
          }

          if (!outcome.ok) {
            if (command.label === "Push") {
              emit(
                makeEvent(
                  runId,
                  project.id,
                  project.name,
                  "push",
                  "warning",
                  "Push failed, attempting rebase + retry once"
                )
              );
              const rebase = await executeWslCommand({
                distro: input.distro,
                command: `git pull --rebase --autostash origin ${project.branch || "HEAD"}`,
                cwd: project.wslPath,
                signal: this.controller?.signal
              });
              if (rebase.code === 0) {
                const retryPush = await executeWslCommand({
                  distro: input.distro,
                  command: `git push origin ${project.branch || "HEAD"}`,
                  cwd: project.wslPath,
                  signal: this.controller?.signal
                });
                if (retryPush.code === 0) {
                  continue;
                }
                failedReason = "Push failed after rebase retry";
                break;
              }
              failedReason = "Rebase failed during push conflict recovery";
              break;
            }

            failedReason = `${command.label} failed`;
            break;
          }
        }

        if (failedReason === "Run cancelled") {
          results.push({
            projectId: project.id,
            projectName: project.name,
            status: "cancelled",
            reason: failedReason
          });
          continue;
        }

        if (failedReason) {
          emit(makeEvent(runId, project.id, project.name, "project", "error", failedReason));
          results.push({
            projectId: project.id,
            projectName: project.name,
            status: "failed",
            reason: failedReason
          });
          continue;
        }

        results.push({
          projectId: project.id,
          projectName: project.name,
          status: "success",
          reason: hasChanges ? "Updated successfully" : "No changes to commit"
        });
        emit(makeEvent(runId, project.id, project.name, "project", "success", "Completed successfully"));
      }

      if (this.controller?.signal.aborted) {
        for (const action of input.actions) {
          if (!results.some((result) => result.projectId === action.projectId)) {
            results.push({
              projectId: action.projectId,
              projectName: action.projectName,
              status: "cancelled",
              reason: "Run cancelled"
            });
          }
        }
      }
    } finally {
      logStream.end();
      this.controller = null;
      this.status = { state: "idle" };
    }

    const endedAt = nowIso();
    const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    const summary: RunSummary = {
      runId,
      startedAt,
      endedAt,
      durationMs,
      counts: {
        success: results.filter((result) => result.status === "success").length,
        failed: results.filter((result) => result.status === "failed").length,
        skipped: results.filter((result) => result.status === "skipped").length,
        cancelled: results.filter((result) => result.status === "cancelled").length
      },
      results,
      logFile
    };

    return summary;
  }
}
