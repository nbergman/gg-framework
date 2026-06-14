import { useEffect, useState } from "react";
import { theme } from "./theme";
import {
  waitForReady,
  listProjects,
  listSessions,
  selectProject,
  getSettings,
  type DiscoveredProject,
  type RecentSession,
} from "./agent";
import { Badge, sourceStyle } from "./Badge";
import { BackButton } from "./BackButton";
import { WindowLayoutButton } from "./WindowLayoutButton";
import { NewProjectModal } from "./NewProjectModal";

interface Props {
  /** Called after the agent has been re-pointed at `cwd` (+ optional session). */
  onChosen: (cwd: string) => void;
  /**
   * When set, open straight to this project's session list (used by the "back
   * to sessions" affordance from inside a project). Falls back to the full
   * project list if the path isn't among the discovered projects.
   */
  initialProjectPath?: string | null;
  /** Shown when the picker is reachable from an open project (enables "back"). */
  onClose?: () => void;
}

/**
 * Full-window project chooser shown when a window has no project yet. Lists
 * every known project (ggcoder/Claude Code/Codex). Selecting one reveals its
 * latest sessions; picking "New session" or an existing session re-points this
 * window's agent at that project cwd.
 */
export function ProjectPicker({
  onChosen,
  initialProjectPath,
  onClose,
}: Props): React.ReactElement {
  const [projects, setProjects] = useState<DiscoveredProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DiscoveredProject | null>(null);
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [projectsRoot, setProjectsRoot] = useState("");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Settings are served by the sidecar — wait for readiness first.
    void waitForReady()
      .then(() => getSettings())
      .then((s) => {
        if (!cancelled && s) setProjectsRoot(s.projectsRoot);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // The window's sidecar serves project discovery; wait for it before asking.
    void waitForReady()
      .then(() => listProjects())
      .then((p) => {
        if (cancelled) return;
        setProjects(p);
        setLoading(false);
        // Deep-link straight to the current project's sessions when asked.
        if (initialProjectPath) {
          const match = p.find((proj) => proj.path === initialProjectPath);
          if (match) openProject(match);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openProject(project: DiscoveredProject): void {
    setSelected(project);
    setSessions([]);
    setSessionsLoading(true);
    void listSessions(project.path).then((s) => {
      setSessions(s);
      setSessionsLoading(false);
    });
  }

  function choose(cwd: string, sessionPath?: string): void {
    if (busy) return;
    setBusy(true);
    // Re-point this window's agent (respawns the sidecar), then let App re-run
    // its ready flow against the new sidecar.
    void selectProject(cwd, sessionPath)
      .then(() => onChosen(cwd))
      .catch(() => setBusy(false));
  }

  return (
    <div className="picker">
      <div className="picker-head" data-tauri-drag-region>
        {selected ? (
          <BackButton label="All projects" onClick={() => setSelected(null)} />
        ) : onClose ? (
          <BackButton label="Back" onClick={onClose} />
        ) : null}
        <span className="picker-title">{selected ? selected.name : "Choose a project"}</span>
        {!selected && !loading && <Badge>{projects.length}</Badge>}
        <span className="picker-head-actions">
          {selected ? (
            <button
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => choose(selected.path)}
            >
              {"+ New session"}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
              {"+ New project"}
            </button>
          )}
          <WindowLayoutButton />
        </span>
      </div>

      {!selected ? (
        <div className="picker-list">
          {loading && (
            <div className="picker-empty" style={{ color: theme.textDim }}>
              {"scanning projects\u2026"}
            </div>
          )}
          {!loading && projects.length === 0 && (
            <div className="picker-empty">
              <span style={{ color: theme.textMuted }}>No projects yet.</span>
              <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
                {"+ New project"}
              </button>
            </div>
          )}
          {projects.map((p) => (
            <button
              key={p.path}
              className="picker-item"
              onClick={() => openProject(p)}
              title={p.path}
            >
              <span className="picker-row">
                <span className="picker-name" style={{ color: theme.text }}>
                  {p.name}
                </span>
                <Badge>{p.lastActiveDisplay}</Badge>
              </span>
              <span className="picker-sources">
                {p.sources.map((s, i) => {
                  const { label, color } = sourceStyle(s);
                  return (
                    <span key={s} style={{ color }}>
                      {i > 0 ? <span style={{ color: theme.textDim }}>{" \u00b7 "}</span> : null}
                      {label}
                    </span>
                  );
                })}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="picker-list">
          {sessionsLoading && (
            <div className="picker-empty" style={{ color: theme.textDim }}>
              {"loading sessions\u2026"}
            </div>
          )}
          {!sessionsLoading && sessions.length === 0 && (
            <div className="picker-empty">
              <span style={{ color: theme.textMuted }}>No previous sessions yet.</span>
              <button
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => choose(selected.path)}
              >
                {"+ New session"}
              </button>
            </div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              className="picker-session"
              disabled={busy}
              onClick={() => choose(selected.path, s.path)}
            >
              <span className="picker-preview" style={{ color: theme.text }}>
                {s.preview || "(no preview)"}
              </span>
              <span className="picker-meta" style={{ color: theme.textMuted }}>
                {`${s.messageCount} msgs \u00b7 ${s.lastActiveDisplay}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {showNew && (
        <NewProjectModal
          projectsRoot={projectsRoot}
          onClose={() => setShowNew(false)}
          onCreated={(cwd) => {
            setShowNew(false);
            onChosen(cwd);
          }}
        />
      )}
    </div>
  );
}
