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

  const script = withWorkingDirectory(command, cwd);
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
