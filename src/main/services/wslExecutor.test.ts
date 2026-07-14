import { describe, expect, it } from "vitest";
import { buildWslCommandArgs } from "./wslExecutor";

describe("wslExecutor", () => {
  it("uses a non-login shell without activating Node version managers", () => {
    const args = buildWslCommandArgs("Ubuntu", "pnpm --version", "/home/fx/project");

    expect(args).toEqual([
      "-d",
      "Ubuntu",
      "--exec",
      "/bin/bash",
      "--noprofile",
      "--norc",
      "-c",
      "cd '/home/fx/project' && pnpm --version"
    ]);
    expect(args.join(" ")).not.toMatch(/\b(?:nvm|fnm)\b/);
  });
});
