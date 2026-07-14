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

function withWorkingDirectory(command: string, cwd?: string): string {
  if (!cwd) {
    return command;
  }
  return `cd ${shellEscape(cwd)} && ${command}`;
}

// Deliberately use a non-login, non-interactive shell. The updater never sources
// user profiles or activates nvm/fnm; required tools must already be on WSL's PATH.
export function buildWslCommandArgs(distro: string, command: string, cwd?: string): string[] {
  const script = withWorkingDirectory(command, cwd);
  return distro
    ? ["-d", distro, "--exec", "/bin/bash", "--noprofile", "--norc", "-c", script]
    : ["--exec", "/bin/bash", "--noprofile", "--norc", "-c", script];
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

  const args = buildWslCommandArgs(distro, command, cwd);

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
