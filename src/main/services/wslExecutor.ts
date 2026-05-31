import { spawn } from "node:child_process";
import { CommandOutcome } from "../../shared/types";
import { shellEscape } from "../lib/utils";

interface ExecuteOptions {
  distro: string;
  command: string;
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
}

// A non-interactive `bash -lc` does not fully source ~/.bashrc (Ubuntu guards it
// with a `case $- in *i*` check), so Node version managers like nvm/fnm — which
// install their hooks there — never load, and commands fall back to the system
// Node. Explicitly activate them so the app uses the same Node the user's
// interactive shell does. Both lines are no-ops when the manager isn't installed.
const NODE_MANAGER_PRELUDE = [
  'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true;',
  'command -v fnm >/dev/null 2>&1 && eval "$(fnm env)" >/dev/null 2>&1 || true;'
].join(" ");

function withWorkingDirectory(command: string, cwd?: string): string {
  if (!cwd) {
    return command;
  }
  return `cd ${shellEscape(cwd)} && ${command}`;
}

export async function executeWslCommand(options: ExecuteOptions): Promise<CommandOutcome> {
  const {
    distro,
    command,
    cwd,
    timeoutMs = 15 * 60_000,
    signal,
    onStdout,
    onStderr
  } = options;

  const script = `${NODE_MANAGER_PRELUDE} ${withWorkingDirectory(command, cwd)}`;
  const args = distro
    ? ["-d", distro, "--", "bash", "-lc", script]
    : ["--", "bash", "-lc", script];

  return await new Promise<CommandOutcome>((resolve, reject) => {
    const child = spawn("wsl.exe", args, {
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cancelled = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    const onAbort = () => {
      cancelled = true;
      child.kill("SIGTERM");
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (onStdout) {
        onStdout(text);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (onStderr) {
        onStderr(text);
      }
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);

      if (timedOut) {
        resolve({
          code: 124,
          stdout,
          stderr: `${stderr}\nCommand timed out after ${timeoutMs}ms.`,
          cancelled
        });
        return;
      }

      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        cancelled
      });
    });
  });
}
