import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Clock,
  Cog,
  Eye,
  FolderOpen,
  FolderSearch,
  GitBranch,
  Layers,
  LayoutDashboard,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Square,
  Terminal,
  Timer,
  Trash2,
  X
} from "lucide-react";
import { DiscoveredProject } from "../shared/types";
import { TabId, useAppStore } from "./store/useAppStore";

/* ------------------------------------------------------------------ */
/*  Navigation config                                                  */
/* ------------------------------------------------------------------ */

interface NavSection {
  label: string;
  items: Array<{ id: TabId; label: string; icon: JSX.Element }>;
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "General",
    items: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
      { id: "roots", label: "Scan Roots", icon: <FolderSearch size={18} /> },
      { id: "projects", label: "Projects", icon: <Layers size={18} /> }
    ]
  },
  {
    label: "Execution",
    items: [
      { id: "preview", label: "Preview", icon: <Eye size={18} /> },
      { id: "monitor", label: "Monitor", icon: <Terminal size={18} /> },
      { id: "history", label: "History", icon: <Clock size={18} /> }
    ]
  },
  {
    label: "Configuration",
    items: [{ id: "settings", label: "Settings", icon: <Cog size={18} /> }]
  }
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function percent(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function manifestSummary(project: DiscoveredProject): Array<{ label: string; color: string }> {
  const pills: Array<{ label: string; color: string }> = [];
  if (project.manifests.composerJson) pills.push({ label: "composer", color: "purple" });
  if (project.manifests.packageJson) pills.push({ label: project.jsManager, color: "green" });
  if (project.manifests.requirementsIn || project.manifests.requirementsTxt)
    pills.push({ label: "pip", color: "teal" });
  return pills;
}

function formatDuration(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/* ------------------------------------------------------------------ */
/*  Shared components                                                  */
/* ------------------------------------------------------------------ */

function PageHeader({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description
}: {
  icon: JSX.Element;
  title: string;
  description: string;
}): JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}): JSX.Element {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" />
      <span>{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */

function Dashboard(): JSX.Element {
  const roots = useAppStore((s) => s.roots);
  const projects = useAppStore((s) => s.projects);
  const history = useAppStore((s) => s.history);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const startScan = useAppStore((s) => s.startScan);
  const requestPreview = useAppStore((s) => s.requestPreview);
  const busy = useAppStore((s) => s.busy);

  const eligible = projects.filter((p) => !p.skipReason).length;
  const lastRun = history[0];

  return (
    <div className="dashboard animate-in">
      <div className="stat-grid">
        <div className="stat-card" onClick={() => setActiveTab("roots")}>
          <div className="stat-icon blue">
            <FolderSearch size={18} />
          </div>
          <div className="stat-value">{roots.length}</div>
          <div className="stat-label">Scan Roots</div>
        </div>
        <div className="stat-card" onClick={() => setActiveTab("projects")}>
          <div className="stat-icon purple">
            <Layers size={18} />
          </div>
          <div className="stat-value">{projects.length}</div>
          <div className="stat-label">Projects</div>
        </div>
        <div className="stat-card" onClick={() => setActiveTab("projects")}>
          <div className="stat-icon green">
            <GitBranch size={18} />
          </div>
          <div className="stat-value">{eligible}</div>
          <div className="stat-label">Eligible</div>
        </div>
        <div className="stat-card" onClick={() => setActiveTab("history")}>
          <div className="stat-icon orange">
            <Timer size={18} />
          </div>
          <div className="stat-value">{lastRun ? formatDuration(lastRun.durationMs) : "--"}</div>
          <div className="stat-label">Last Run</div>
        </div>
      </div>

      <div className="welcome-card">
        <h2>Project Update Flight Deck</h2>
        <p>
          Scan your WSL workspace, preview exact commands, and run sequential dependency updates
          with git safety gates and history tracking.
        </p>
        <div className="welcome-actions">
          <button className="btn btn-primary" disabled={busy.scanning} onClick={() => startScan()}>
            {busy.scanning ? (
              <>
                <Loader2 size={14} className="icon-spin" /> Scanning...
              </>
            ) : (
              <>
                <Search size={14} /> Scan Roots
              </>
            )}
          </button>
          <button className="btn" disabled={busy.previewing} onClick={() => requestPreview()}>
            {busy.previewing ? (
              <>
                <Loader2 size={14} className="icon-spin" /> Preparing...
              </>
            ) : (
              <>
                <Eye size={14} /> Preview Run
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Roots                                                              */
/* ------------------------------------------------------------------ */

function RootEditor(): JSX.Element {
  const roots = useAppStore((s) => s.roots);
  const addRoot = useAppStore((s) => s.addRoot);
  const updateRoot = useAppStore((s) => s.updateRoot);
  const removeRoot = useAppStore((s) => s.removeRoot);
  const [path, setPath] = useState("/home/");
  const [maxDepth, setMaxDepth] = useState<1 | 2 | 3>(1);
  const [nameExcludes, setNameExcludes] = useState("");
  const [pathExcludes, setPathExcludes] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await addRoot({
      wslPath: path.trim(),
      maxDepth,
      enabled: true,
      exclusionsByName: nameExcludes
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      exclusionsByPath: pathExcludes
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    });
    setNameExcludes("");
    setPathExcludes("");
  };

  return (
    <div className="gap-y animate-in">
      <div className="card">
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="form-field">
            <label>WSL Path</label>
            <input type="text" value={path} onChange={(e) => setPath(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>Scan Depth</label>
            <select
              value={maxDepth}
              onChange={(e) => setMaxDepth(Number(e.target.value) as 1 | 2 | 3)}
            >
              <option value={1}>1 level</option>
              <option value={2}>2 levels</option>
              <option value={3}>3 levels</option>
            </select>
          </div>
          <div className="form-field">
            <label>Exclude Names</label>
            <input
              type="text"
              value={nameExcludes}
              onChange={(e) => setNameExcludes(e.target.value)}
              placeholder="portal, legacy"
            />
          </div>
          <div className="form-field">
            <label>Exclude Paths</label>
            <input
              type="text"
              value={pathExcludes}
              onChange={(e) => setPathExcludes(e.target.value)}
              placeholder="/home/user/archive"
            />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary">
              <Plus size={14} /> Add Root
            </button>
          </div>
        </form>
      </div>

      {roots.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={24} />}
          title="No scan roots yet"
          description="Add a WSL path above to start discovering projects."
        />
      ) : (
        <div className="root-list">
          {roots.map((root) => (
            <div className="root-card" key={root.id}>
              <div className="root-card-header">
                <div className="root-card-path">
                  <FolderOpen size={16} />
                  {root.wslPath}
                </div>
                <span className={root.enabled ? "pill pill-green" : "pill pill-muted"}>
                  {root.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="root-card-controls">
                <div className="inline-select">
                  Depth
                  <select
                    value={root.maxDepth}
                    onChange={(e) =>
                      updateRoot(root.id, { maxDepth: Number(e.target.value) as 1 | 2 | 3 })
                    }
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </div>
                <Toggle
                  checked={root.enabled}
                  onChange={(v) => updateRoot(root.id, { enabled: v })}
                  label="Active"
                />
                <button className="btn btn-danger btn-sm" onClick={() => removeRoot(root.id)}>
                  <Trash2 size={12} /> Remove
                </button>
              </div>
              <div className="root-card-meta">
                Name excludes: {root.exclusionsByName.join(", ") || "none"} &middot; Path excludes:{" "}
                {root.exclusionsByPath.join(", ") || "none"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Projects                                                           */
/* ------------------------------------------------------------------ */

function ProjectList(): JSX.Element {
  const projects = useAppStore((s) => s.projects);
  const selectedIds = useAppStore((s) => s.selectedProjectIds);
  const toggle = useAppStore((s) => s.toggleProjectEnabled);
  const selectAll = useAppStore((s) => s.selectAllProjects);
  const [filter, setFilter] = useState<"all" | "eligible" | "skipped">("all");

  const selected = new Set(selectedIds);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filter === "eligible") return !p.skipReason;
      if (filter === "skipped") return Boolean(p.skipReason);
      return true;
    });
  }, [projects, filter]);

  if (projects.length === 0) {
    return (
      <div className="animate-in">
        <EmptyState
          icon={<Layers size={24} />}
          title="No projects discovered"
          description="Add scan roots and run a scan to discover your projects."
        />
      </div>
    );
  }

  return (
    <div className="gap-y animate-in">
      <div className="toolbar">
        <div className="segmented">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
            All ({projects.length})
          </button>
          <button
            className={filter === "eligible" ? "active" : ""}
            onClick={() => setFilter("eligible")}
          >
            Eligible ({projects.filter((p) => !p.skipReason).length})
          </button>
          <button
            className={filter === "skipped" ? "active" : ""}
            onClick={() => setFilter("skipped")}
          >
            Skipped ({projects.filter((p) => p.skipReason).length})
          </button>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-sm btn-ghost" onClick={() => selectAll(true)}>
            Select All
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => selectAll(false)}>
            Select None
          </button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }}></th>
              <th>Project</th>
              <th>Path</th>
              <th>Stack</th>
              <th>Git</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((project) => (
              <tr key={project.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(project.id)}
                    onChange={(e) => toggle(project.id, e.target.checked)}
                  />
                </td>
                <td className="cell-name">{project.name}</td>
                <td className="cell-path">{project.wslPath}</td>
                <td>
                  <div className="badge-group">
                    {manifestSummary(project).map((pill) => (
                      <span key={pill.label} className={`pill pill-${pill.color}`}>
                        {pill.label}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  {project.isGitRepo ? (
                    <span className={project.skipReason ? "pill pill-orange" : "pill pill-green"}>
                      {project.branch || "?"} &middot; {project.cleanState}
                    </span>
                  ) : (
                    <span className="pill pill-muted">no git</span>
                  )}
                </td>
                <td className="cell-muted">{project.skipReason || "Ready"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Run Preview                                                        */
/* ------------------------------------------------------------------ */

function RunPreview(): JSX.Element {
  const previewActions = useAppStore((s) => s.previewActions);
  const startRun = useAppStore((s) => s.startRun);

  if (previewActions.length === 0) {
    return (
      <div className="animate-in">
        <EmptyState
          icon={<Eye size={24} />}
          title="No preview available"
          description="Select projects and click 'Preview Run' to see planned commands."
        />
      </div>
    );
  }

  return (
    <div className="gap-y animate-in">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={() => startRun()}>
          <Play size={14} /> Confirm & Run
        </button>
      </div>

      <div className="action-list">
        {previewActions.map((action) => (
          <div className="action-card" key={action.projectId}>
            <div className="action-card-header">
              <span className="action-card-name">{action.projectName}</span>
              <span className="action-card-path">{action.projectPath}</span>
            </div>
            {action.skipReasons.length > 0 ? (
              <div className="skip-message">Skipped: {action.skipReasons.join("; ")}</div>
            ) : (
              <div className="action-card-body">
                <ol className="command-list">
                  {action.commands.map((cmd, idx) => (
                    <li className="command-item" key={`${action.projectId}-${idx}`}>
                      <span className="command-label">{cmd.label}</span>
                      <code className="command-code">{cmd.command}</code>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Run Monitor                                                        */
/* ------------------------------------------------------------------ */

function RunMonitor(): JSX.Element {
  const runEvents = useAppStore((s) => s.runEvents);
  const runStatus = useAppStore((s) => s.runStatus);
  const cancelRun = useAppStore((s) => s.cancelRun);
  const busy = useAppStore((s) => s.busy);

  const isRunning = runStatus.state === "running";

  return (
    <div className="gap-y animate-in">
      <div className="terminal">
        <div className="terminal-header">
          <div className="terminal-dots">
            <span className="terminal-dot red" />
            <span className="terminal-dot yellow" />
            <span className="terminal-dot green" />
          </div>
          <div className="terminal-status">
            <span className={`status-dot ${isRunning ? "running" : "idle"}`} />
            {runStatus.state}
            {isRunning && (
              <button
                className="btn btn-sm btn-danger"
                style={{ marginLeft: 8 }}
                onClick={() => cancelRun()}
              >
                <Square size={10} /> Stop
              </button>
            )}
          </div>
        </div>
        <div className="terminal-body">
          {runEvents.length === 0 ? (
            <div className="terminal-empty">
              {busy.running ? "Waiting for events..." : "Run output will appear here."}
            </div>
          ) : (
            runEvents.map((event, i) => (
              <div className={`log-line level-${event.level}`} key={`${event.timestamp}-${i}`}>
                <span className="log-time">
                  {new Date(event.timestamp).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  })}
                </span>
                <span className="log-project">{event.projectName || "system"}</span>
                <span className="log-stage">{event.stage}</span>
                <span className="log-message">{event.message.trim()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  History                                                            */
/* ------------------------------------------------------------------ */

function HistoryPanel(): JSX.Element {
  const history = useAppStore((s) => s.history);
  const clearHistory = useAppStore((s) => s.clearHistory);

  if (history.length === 0) {
    return (
      <div className="animate-in">
        <EmptyState
          icon={<Clock size={24} />}
          title="No run history"
          description="Completed runs will appear here with detailed results."
        />
      </div>
    );
  }

  return (
    <div className="gap-y animate-in">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-danger btn-sm" onClick={() => clearHistory()}>
          <Trash2 size={12} /> Clear History
        </button>
      </div>

      <div className="history-list">
        {history.map((run) => {
          const total = run.results.length || 1;
          return (
            <div className="history-card" key={run.runId}>
              <div className="history-card-header">
                <div className="history-card-title">
                  <Clock size={14} />
                  {run.startedAt ? formatDate(run.startedAt) : run.runId}
                </div>
                <span className="pill pill-blue">{formatDuration(run.durationMs)}</span>
              </div>

              <div className="result-bar">
                <div
                  className="result-segment success"
                  style={{ width: `${percent(run.counts.success, total)}%` }}
                />
                <div
                  className="result-segment failed"
                  style={{ width: `${percent(run.counts.failed, total)}%` }}
                />
                <div
                  className="result-segment skipped"
                  style={{ width: `${percent(run.counts.skipped, total)}%` }}
                />
                <div
                  className="result-segment cancelled"
                  style={{ width: `${percent(run.counts.cancelled, total)}%` }}
                />
              </div>

              <div className="result-counts">
                <span className="result-count">
                  <span className="dot dot-green" /> {run.counts.success} success
                </span>
                <span className="result-count">
                  <span className="dot dot-red" /> {run.counts.failed} failed
                </span>
                <span className="result-count">
                  <span className="dot dot-gray" /> {run.counts.skipped} skipped
                </span>
                <span className="result-count">
                  <span className="dot dot-orange" /> {run.counts.cancelled} cancelled
                </span>
              </div>

              <div className="history-log-path">{run.logFile}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */

function SettingsPanel(): JSX.Element {
  const settings = useAppStore((s) => s.settings);
  const wslDistros = useAppStore((s) => s.wslDistros);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const refreshWslDistros = useAppStore((s) => s.refreshWslDistros);

  if (!settings) {
    return (
      <div className="loading-screen" style={{ height: "auto", padding: 48 }}>
        <Loader2 size={24} className="icon-spin" />
        <p>Loading settings...</p>
      </div>
    );
  }

  const selectedDistro =
    settings.distro ||
    wslDistros.find((d) => d.isDefault)?.name ||
    wslDistros[0]?.name ||
    "";

  return (
    <div className="settings-layout animate-in">
      <div className="settings-section">
        <h3>
          <Terminal size={16} /> WSL Configuration
        </h3>
        <div className="form-field" style={{ maxWidth: 400 }}>
          <label>Distribution</label>
          <div className="input-with-action">
            <select
              value={selectedDistro}
              onChange={(e) => updateSettings({ distro: e.target.value })}
              disabled={wslDistros.length === 0}
            >
              {wslDistros.length === 0 && <option value="">No distros detected</option>}
              {wslDistros.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                  {d.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => refreshWslDistros()}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
        {wslDistros.length === 0 && (
          <p className="warning-text" style={{ marginTop: 8 }}>
            No WSL distro found. Run <code>wsl --install</code> and restart the app.
          </p>
        )}
      </div>

      <div className="settings-section">
        <h3>
          <GitBranch size={16} /> Git Options
        </h3>
        <div className="settings-toggles">
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Pull before update</div>
              <div className="settings-row-desc">Run git pull before updating dependencies</div>
            </div>
            <Toggle
              checked={settings.pullBeforeUpdate}
              onChange={(v) => updateSettings({ pullBeforeUpdate: v })}
              label=""
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Auto commit</div>
              <div className="settings-row-desc">Automatically commit dependency changes</div>
            </div>
            <Toggle
              checked={settings.autoCommit}
              onChange={(v) => updateSettings({ autoCommit: v })}
              label=""
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Auto push</div>
              <div className="settings-row-desc">Push commits to remote after updating</div>
            </div>
            <Toggle
              checked={settings.autoPush}
              onChange={(v) => updateSettings({ autoPush: v })}
              label=""
            />
          </div>
        </div>
        <div className="commit-msg">
          Commit message: <strong>{settings.commitMessage}</strong>
        </div>
      </div>

      <div className="settings-section">
        <h3>
          <RefreshCw size={16} /> Retry Configuration
        </h3>
        <div className="form-grid" style={{ maxWidth: 400 }}>
          <div className="form-field">
            <label>Retry Count</label>
            <input
              type="number"
              min={1}
              max={10}
              value={settings.retryCount}
              onChange={(e) => updateSettings({ retryCount: Number(e.target.value) })}
            />
          </div>
          <div className="form-field">
            <label>Retry Delay (ms)</label>
            <input
              type="number"
              min={500}
              step={500}
              value={settings.retryDelayMs}
              onChange={(e) => updateSettings({ retryDelayMs: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>
          <Layers size={16} /> Package Managers
        </h3>
        <div className="tool-grid">
          {Object.entries(settings.tools).map(([key, value]) => (
            <Toggle
              key={key}
              checked={value}
              onChange={(v) => updateSettings({ tools: { ...settings.tools, [key]: v } })}
              label={key}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

function Sidebar(): JSX.Element {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const startScan = useAppStore((s) => s.startScan);
  const requestPreview = useAppStore((s) => s.requestPreview);
  const busy = useAppStore((s) => s.busy);
  const runState = useAppStore((s) => s.runStatus.state);

  return (
    <aside className="sidebar">
      <div className="sidebar-drag" />
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Rocket size={17} />
        </div>
        <div>
          <h1>Git Updater</h1>
          <p>WSL Project Automation</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="sidebar-section-label">{section.label}</div>
            {section.items.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${activeTab === item.id ? "active" : ""}`}
                onClick={() => setActiveTab(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
                {item.id === "monitor" && (runState === "running" || runState === "cancelling") && (
                  <span className="nav-badge-running" />
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-actions">
        <button
          className="btn btn-primary btn-full btn-sm"
          disabled={busy.scanning}
          onClick={() => startScan()}
        >
          {busy.scanning ? (
            <>
              <Loader2 size={13} className="icon-spin" /> Scanning...
            </>
          ) : (
            <>
              <Search size={13} /> Scan Roots
            </>
          )}
        </button>
        <button
          className="btn btn-full btn-sm"
          disabled={busy.previewing}
          onClick={() => requestPreview()}
        >
          {busy.previewing ? (
            <>
              <Loader2 size={13} className="icon-spin" /> Preparing...
            </>
          ) : (
            <>
              <Eye size={13} /> Preview Run
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Page title map                                                     */
/* ------------------------------------------------------------------ */

const PAGE_META: Record<TabId, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Overview of your workspace" },
  roots: { title: "Scan Roots", subtitle: "WSL paths to scan for projects" },
  projects: { title: "Projects", subtitle: "Discovered projects and their status" },
  preview: { title: "Run Preview", subtitle: "Commands that will be executed" },
  monitor: { title: "Monitor", subtitle: "Live output from the current run" },
  history: { title: "History", subtitle: "Results from previous runs" },
  settings: { title: "Settings", subtitle: "Configure WSL, git, and tool options" }
};

/* ------------------------------------------------------------------ */
/*  Main App                                                           */
/* ------------------------------------------------------------------ */

export default function App(): JSX.Element {
  const initialize = useAppStore((s) => s.initialize);
  const initialized = useAppStore((s) => s.initialized);
  const activeTab = useAppStore((s) => s.activeTab);
  const busy = useAppStore((s) => s.busy);
  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);

  useEffect(() => {
    initialize().catch(console.error);
  }, [initialize]);

  if (!initialized || busy.loading) {
    return (
      <div className="loading-screen">
        <Loader2 size={32} className="icon-spin" />
        <p>Loading workspace...</p>
      </div>
    );
  }

  const meta = PAGE_META[activeTab];

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="content">
        <PageHeader title={meta.title} subtitle={meta.subtitle} />
        <div className="content-scroll">
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "roots" && <RootEditor />}
          {activeTab === "projects" && <ProjectList />}
          {activeTab === "preview" && <RunPreview />}
          {activeTab === "monitor" && <RunMonitor />}
          {activeTab === "history" && <HistoryPanel />}
          {activeTab === "settings" && <SettingsPanel />}
        </div>
      </div>

      {error && (
        <div className="toast toast-error">
          <AlertCircle size={16} className="toast-icon" />
          <span className="toast-msg">{error}</span>
          <button className="toast-close" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
