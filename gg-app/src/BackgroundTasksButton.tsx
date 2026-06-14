import { useEffect, useRef, useState } from "react";
import { theme } from "./theme";
import { killTask, type BackgroundTask } from "./agent";

/**
 * Footer indicator for background tasks (bash run_in_background) — mirrors the
 * ggcoder TUI's BackgroundTasksBar. Shows a running count; clicking opens an
 * upward popover listing each task with its command, status, and a kill button.
 * Hidden by the caller when there are no tasks.
 */
function shortCommand(cmd: string): string {
  const firstLine = cmd.split("\n")[0] ?? cmd;
  return firstLine.length > 48 ? `${firstLine.slice(0, 47)}\u2026` : firstLine;
}

export function BackgroundTasksButton({ tasks }: { tasks: BackgroundTask[] }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const id = setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  const runningCount = tasks.filter((t) => t.exitCode === null).length;
  // Spinner color while anything runs; muted once all have exited.
  const accent = runningCount > 0 ? theme.warning : theme.textMuted;

  return (
    <span className="bgtasks" ref={ref}>
      <button
        className="bgtasks-button"
        style={{ color: accent, borderColor: theme.border }}
        title="Background tasks"
        onClick={() => setOpen((o) => !o)}
      >
        {"\u2699 "}
        {runningCount > 0 ? `${runningCount} task${runningCount === 1 ? "" : "s"}` : "tasks"}
      </button>
      {open && (
        <div
          className="bgtasks-menu"
          style={{ background: theme.surface2, borderColor: theme.border }}
        >
          <div className="bgtasks-title" style={{ color: theme.textMuted }}>
            background tasks
          </div>
          {tasks.length === 0 && (
            <div className="bgtasks-empty" style={{ color: theme.textDim }}>
              no background tasks
            </div>
          )}
          {tasks.map((t) => {
            const running = t.exitCode === null;
            return (
              <div key={t.id} className="bgtasks-item">
                <span
                  className="bgtasks-dot"
                  style={{ color: running ? theme.warning : theme.textDim }}
                >
                  {"\u23FA"}
                </span>
                <span className="bgtasks-cmd" style={{ color: theme.text }} title={t.command}>
                  {shortCommand(t.command)}
                </span>
                <span className="bgtasks-status" style={{ color: theme.textDim }}>
                  {running ? `pid ${t.pid}` : `exit ${t.exitCode}`}
                </span>
                {running && (
                  <button
                    className="bgtasks-kill"
                    style={{ color: theme.error }}
                    title="Stop task"
                    onClick={() => void killTask(t.id)}
                  >
                    kill
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
