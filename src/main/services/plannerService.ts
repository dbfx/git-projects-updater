import {
  AppSettings,
  DiscoveredProject,
  EffectiveProjectTools,
  PlannedAction,
  PlannedCommand,
  ProjectPreference,
  RunRequest,
  ToolToggles
} from "../../shared/types";

function mergeToolToggles(base: ToolToggles, override?: Partial<ToolToggles>): EffectiveProjectTools {
  return {
    composer: override?.composer ?? base.composer,
    npm: override?.npm ?? base.npm,
    pnpm: override?.pnpm ?? base.pnpm,
    yarn: override?.yarn ?? base.yarn,
    pip: override?.pip ?? base.pip
  };
}

function gitSkipReasons(project: DiscoveredProject): string[] {
  if (!project.isGitRepo) {
    return ["Not a git repository"];
  }
  if (project.cleanState === "dirty") {
    return ["Repository has uncommitted changes"];
  }
  return [];
}

function buildToolCommands(project: DiscoveredProject, tools: EffectiveProjectTools): PlannedCommand[] {
  const commands: PlannedCommand[] = [];
  if (project.manifests.composerJson && tools.composer) {
    commands.push({
      label: "Composer update",
      command: "composer update --no-interaction --quiet",
      retriable: true
    });
  }

  if (project.manifests.packageJson) {
    if (project.jsManager === "pnpm" && tools.pnpm) {
      commands.push({
        label: "pnpm update",
        command: "pnpm update --reporter=silent",
        retriable: true
      });
    } else if (project.jsManager === "yarn" && tools.yarn) {
      commands.push({
        label: "yarn upgrade",
        command: "yarn upgrade --silent",
        retriable: true
      });
    } else if (project.jsManager === "npm" && tools.npm) {
      commands.push({
        label: "npm update",
        command: "npm update --silent",
        retriable: true
      });
    }
  }

  // Probe for a virtual environment before running pip commands (avoids PEP 668 errors)
  const venvProbe = 'PY=python; for d in .venv venv env; do [ -x "$d/bin/python" ] && PY="$d/bin/python" && break; done';

  if (tools.pip && project.manifests.requirementsIn) {
    commands.push({
      label: "pip-compile upgrade",
      command:
        `${venvProbe}; PC=pip-compile; for d in .venv venv env; do [ -x "$d/bin/pip-compile" ] && PC="$d/bin/pip-compile" && break; done; ` +
        'if command -v "$PC" >/dev/null 2>&1; then $PC --upgrade requirements.in; ' +
        'elif [ -f requirements.txt ]; then $PY -m pip install --upgrade -r requirements.txt; ' +
        "else echo 'pip-compile not found and no requirements.txt fallback'; fi",
      retriable: true
    });
  } else if (tools.pip && project.manifests.requirementsTxt) {
    commands.push({
      label: "pip requirements update",
      command: `${venvProbe}; $PY -m pip install --upgrade -r requirements.txt`,
      retriable: true
    });
  }

  return commands;
}

export function buildPreviewActions(
  projects: DiscoveredProject[],
  preferences: Record<string, ProjectPreference>,
  settings: AppSettings,
  request: RunRequest
): PlannedAction[] {
  const selectedIds =
    request.selectedProjectIds.length > 0
      ? new Set(request.selectedProjectIds)
      : new Set(projects.filter((project) => project.enabled).map((project) => project.id));

  const sorted = [...projects].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    return a.wslPath.localeCompare(b.wslPath);
  });

  return sorted
    .filter((project) => selectedIds.has(project.id))
    .map((project) => {
      const pref = preferences[project.id];
      const mergedTools = mergeToolToggles(settings.tools, pref?.tools);
      const skipReasons: string[] = [];
      if (!(pref?.enabled ?? project.enabled)) {
        skipReasons.push("Project disabled");
      }
      skipReasons.push(...gitSkipReasons(project));

      const commands: PlannedCommand[] = [];
      if (skipReasons.length === 0 && settings.pullBeforeUpdate) {
        commands.push({
          label: "Git pull",
          command: `git pull --ff-only origin ${project.branch || "HEAD"}`,
          retriable: true
        });
      }

      if (skipReasons.length === 0 && settings.ensureLineEndings) {
        commands.push({
          label: "Ensure .gitattributes (LF)",
          command: `if [ ! -f .gitattributes ]; then printf '* text=auto eol=lf\\n' > .gitattributes; echo 'Created .gitattributes'; else echo '.gitattributes already exists'; fi`
        });
      }

      if (skipReasons.length === 0) {
        commands.push(...buildToolCommands(project, mergedTools));
        commands.push({
          label: "Stage changes",
          command: "git add -A"
        });
        commands.push({
          label: "Check staged diff",
          command: "git -c core.fileMode=false diff --cached --quiet -w"
        });
        if (settings.autoCommit) {
          commands.push({
            label: "Commit",
            command: `git commit -m "${settings.commitMessage.replace(/"/g, '\\"')}"`
          });
          if (settings.autoPush && request.gitWriteMode !== "commit_only") {
            commands.push({
              label: "Push",
              command: `git push origin ${project.branch || "HEAD"}`,
              retriable: true
            });
          }
        }
      }

      return {
        projectId: project.id,
        projectName: project.name,
        projectPath: project.wslPath,
        commands,
        skipReasons
      };
    });
}
