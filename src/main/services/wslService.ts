import { spawnSync } from "node:child_process";
import { WslDistro } from "../../shared/types";

function parseLines(stdout: string): string[] {
  return stdout
    .replace(/\u0000/g, "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function decodeWslText(value: string | Buffer | null | undefined): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (value.length > 1 && value[1] === 0x00) {
    return value.toString("utf16le");
  }
  return value.toString("utf8");
}

function runWsl(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const outcome = spawnSync("wsl.exe", args, {
    windowsHide: true
  });
  return {
    status: outcome.status,
    stdout: decodeWslText(outcome.stdout),
    stderr: decodeWslText(outcome.stderr)
  };
}

function getDefaultDistroFromVerboseList(): string | null {
  const verbose = runWsl(["-l", "-v"]);
  if (verbose.status !== 0) {
    return null;
  }

  const lines = parseLines(verbose.stdout);
  for (const line of lines) {
    if (!line.startsWith("*")) {
      continue;
    }
    const withoutStar = line.replace(/^\*\s*/, "");
    const parts = withoutStar.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    return parts[0];
  }

  return null;
}

export function listWslDistros(): WslDistro[] {
  const listed = runWsl(["-l", "-q"]);
  if (listed.status !== 0) {
    throw new Error(
      `Failed to list WSL distros. ${listed.stderr?.trim() || "Please verify WSL is installed."}`
    );
  }

  const names = parseLines(listed.stdout);
  const defaultDistro = getDefaultDistroFromVerboseList();

  return names.map((name, index) => ({
    name,
    isDefault: defaultDistro ? defaultDistro === name : index === 0
  }));
}
