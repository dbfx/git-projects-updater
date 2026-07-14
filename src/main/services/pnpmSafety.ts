import { DiscoveredProject } from "../../shared/types";

const competingLockfiles = (project: DiscoveredProject): string[] => {
  const lockfiles: string[] = [];
  if (project.manifests.packageLock) lockfiles.push("package-lock.json");
  if (project.manifests.npmShrinkwrap) lockfiles.push("npm-shrinkwrap.json");
  if (project.manifests.yarnLock) lockfiles.push("yarn.lock");
  if (project.manifests.bunLock) lockfiles.push("bun.lock/bun.lockb");
  return lockfiles;
};

export function pnpmEligibilityReason(project: DiscoveredProject): string | undefined {
  if (!project.manifests.packageJson) {
    return undefined;
  }

  if (!project.manifests.pnpmLock) {
    return "JavaScript project does not have pnpm-lock.yaml (only pnpm is supported)";
  }

  const conflicts = competingLockfiles(project);
  if (conflicts.length > 0) {
    return `JavaScript project has competing lockfile(s): ${conflicts.join(", ")}`;
  }

  if (project.packageManagerReadError) {
    return "package.json could not be parsed to verify the package manager";
  }

  const declared = project.declaredPackageManager?.trim();
  if (declared && declared !== "pnpm" && !declared.startsWith("pnpm@")) {
    return `package.json declares a non-pnpm package manager: ${declared}`;
  }

  return undefined;
}

// This is run again after git pull so a remote package-manager migration cannot
// bypass the scan/preview checks. It intentionally rejects ambiguous mixed-lockfile
// repositories instead of guessing which package manager owns the lock state.
export const VERIFY_PNPM_PROJECT_COMMAND = `
fail() { echo "$1" 1>&2; exit 42; }
[ -f package.json ] || fail "Refusing update: package.json is missing"
[ -f pnpm-lock.yaml ] || fail "Refusing update: pnpm-lock.yaml is missing"
conflicts=""
for lockfile in package-lock.json npm-shrinkwrap.json yarn.lock bun.lock bun.lockb; do
  [ ! -f "$lockfile" ] || conflicts="$conflicts $lockfile"
done
[ -z "$conflicts" ] || fail "Refusing update: competing package-manager lockfile(s):$conflicts"
command -v node >/dev/null 2>&1 || fail "Refusing update: Node.js is unavailable, so package.json cannot be verified"
declared="$(node -e 'const fs=require("fs"); try { const p=JSON.parse(fs.readFileSync("package.json", "utf8")); const v=typeof p.packageManager === "string" ? p.packageManager : ""; process.stdout.write(v.replace(/[\\r\\n]/g, "")); } catch { process.exit(1); }')" || fail "Refusing update: package.json is invalid"
case "$declared" in
  ""|pnpm|pnpm@*) ;;
  *) fail "Refusing update: package.json declares non-pnpm package manager '$declared'" ;;
esac
`.trim();
