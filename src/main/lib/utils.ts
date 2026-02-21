import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

export function projectIdFromPath(rootId: string, wslPath: string): string {
  const key = `${rootId}:${wslPath}`;
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

export function rootId(): string {
  return randomUUID();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function basename(inputPath: string): string {
  const normalized = inputPath.replace(/\/+$/, "");
  return path.posix.basename(normalized);
}

export function isWslPath(value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  if (/^[a-zA-Z]:\\/.test(value) || /^[a-zA-Z]:\//.test(value)) {
    return false;
  }

  return value.startsWith("/");
}

export function normalizeWslPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return trimmed;
  }
  return trimmed.replace(/\/+$/, "") || "/";
}
