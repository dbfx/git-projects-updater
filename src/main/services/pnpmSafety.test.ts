import { describe, expect, it } from "vitest";
import { READ_PACKAGE_MANAGER_SCRIPT, VERIFY_PNPM_PROJECT_COMMAND } from "./pnpmSafety";

describe("pnpmSafety", () => {
  it("requires installed Node.js and pnpm without Windows-escaped JavaScript quotes", () => {
    expect(VERIFY_PNPM_PROJECT_COMMAND).toContain("command -v node");
    expect(VERIFY_PNPM_PROJECT_COMMAND).toContain("command -v pnpm");
    expect(VERIFY_PNPM_PROJECT_COMMAND).toContain("pnpm --version");
    expect(VERIFY_PNPM_PROJECT_COMMAND).toContain(`node -e '${READ_PACKAGE_MANAGER_SCRIPT}'`);
    expect(READ_PACKAGE_MANAGER_SCRIPT).not.toContain('\\"');
  });
});
