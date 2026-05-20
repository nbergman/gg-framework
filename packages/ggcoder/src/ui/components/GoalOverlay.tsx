import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import {
  createGoalRun,
  formatGoalPrerequisiteInstruction,
  goalHasBlockingPrerequisites,
  isBlockingGoalPrerequisite,
  loadGoalRuns,
  saveGoalRuns,
  summarizeGoalCountsFromRuns,
  type GoalPrerequisite,
  type GoalRun,
  type GoalRunStatus,
  type GoalTask,
} from "../../core/goal-store.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { useTheme } from "../theme/theme.js";

const GOAL_LOGO = [" ▄▀▀▀ ▄▀▀▀", " █ ▀█ █ ▀█", " ▀▄▄▀ ▀▄▄▀"];
const GRADIENT = [
  "#4ade80",
  "#5ad89a",
  "#6fd2b4",
  "#85ccce",
  "#60a5fa",
  "#85ccce",
  "#6fd2b4",
  "#5ad89a",
];
const GOAL_SUCCESS = "#4ade80";
const GOAL_ACTIVE = "#fbbf24";
const GAP = "   ";
const LOGO_WIDTH = 9;
const SIDE_BY_SIDE_MIN = LOGO_WIDTH + GAP.length + 20;

export interface GoalOverlayProps {
  cwd: string;
  onClose: () => void;
  onRunGoal: (run: GoalRun) => void;
  onVerifyGoal: (run: GoalRun) => void;
  onPauseGoal: (run: GoalRun) => void;
  agentRunning?: boolean;
}

export function clampGoalSelectedIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(0, index), length - 1);
}

export function formatGoalPrerequisiteSummary(run: GoalRun): string {
  if (run.prerequisites.length === 0) return "no prereqs";
  const met = run.prerequisites.filter((item) => item.status === "met").length;
  const missing = run.prerequisites.filter((item) => item.status === "missing").length;
  const unknown = run.prerequisites.filter((item) => item.status === "unknown").length;
  const suffix = [missing > 0 ? `${missing} missing` : "", unknown > 0 ? `${unknown} unknown` : ""]
    .filter(Boolean)
    .join(", ");
  return `${met}/${run.prerequisites.length} prereqs met${suffix ? ` (${suffix})` : ""}`;
}

export function formatGoalTaskSummary(run: GoalRun): string {
  if (run.tasks.length === 0) return "no tasks";
  const done = run.tasks.filter((item) => item.status === "done").length;
  const running = run.tasks.filter(
    (item) => item.status === "running" || item.status === "verifying",
  ).length;
  const failed = run.tasks.filter((item) => item.status === "failed").length;
  const blocked = run.tasks.filter((item) => item.status === "blocked").length;
  const suffix = [
    running > 0 ? `${running} running` : "",
    failed > 0 ? `${failed} failed` : "",
    blocked > 0 ? `${blocked} blocked` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return `${done}/${run.tasks.length} tasks done${suffix ? ` (${suffix})` : ""}`;
}

export function formatGoalVerifierSummary(run: GoalRun): string {
  if (run.verifier?.lastResult) return `verifier ${run.verifier.lastResult.status}`;
  if (run.verifier?.command) return "verifier command ready";
  if (run.verifier?.description) return "verifier described";
  return "no verifier";
}

export function getGoalStatusCountsText(runs: readonly GoalRun[]): string {
  const counts = summarizeGoalCountsFromRuns(runs);
  return `${counts.passed} passed · ${counts.running} running · ${counts.pending} pending · ${counts.blocked} blocked`;
}

export function sortGoalRunsForOverlay(runs: readonly GoalRun[]): GoalRun[] {
  return [...runs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function shouldPersistGoalOverlayRuns(
  previousRuns: readonly GoalRun[],
  nextRuns: readonly GoalRun[],
): boolean {
  if (nextRuns.length > 0) return true;
  if (previousRuns.length === 0) return true;
  return !previousRuns.some(
    (run) =>
      run.status === "running" ||
      run.status === "verifying" ||
      run.activeWorkerId !== undefined ||
      run.tasks.some((task) => task.status === "running" || task.status === "verifying"),
  );
}

function GoalGradientText({ text }: { text: string }) {
  const chars: React.ReactNode[] = [];
  let colorIdx = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " ") {
      chars.push(ch);
    } else {
      const color = GRADIENT[colorIdx % GRADIENT.length];
      chars.push(
        <Text key={i} color={color}>
          {ch}
        </Text>,
      );
      colorIdx++;
    }
  }
  return <Text>{chars}</Text>;
}

function formatDisplayPath(cwd: string): string {
  const home = process.env.HOME ?? "";
  return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

function statusColor(status: GoalRunStatus): string {
  switch (status) {
    case "passed":
      return GOAL_SUCCESS;
    case "running":
    case "verifying":
    case "blocked":
      return GOAL_ACTIVE;
    case "failed":
      return "red";
    case "paused":
    case "draft":
    case "ready":
      return "";
  }
}

function taskStatusColor(status: GoalTask["status"]): string {
  switch (status) {
    case "done":
      return "green";
    case "failed":
      return "red";
    case "blocked":
      return "yellow";
    case "running":
    case "verifying":
      return "cyan";
    case "pending":
      return "blue";
  }
}

function prerequisiteStatusColor(status: GoalPrerequisite["status"]): string {
  switch (status) {
    case "met":
      return "green";
    case "missing":
      return "yellow";
    case "unknown":
      return "cyan";
  }
}

export function getGoalDetailTaskHeading(run: GoalRun): string {
  return run.prerequisites.length > 0 ? "2. Worker tasks" : "Worker tasks";
}

export function getGoalUserPrerequisiteHeading(run: GoalRun): string | null {
  return run.prerequisites.length > 0 ? "1. User prerequisites" : null;
}

export function formatGoalTaskDetailSummary(summary: string): string {
  const firstLine = summary
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "";
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}…` : firstLine;
}

function GoalHeader({
  cwd,
  runs,
  agentRunning,
}: {
  cwd: string;
  runs: readonly GoalRun[];
  agentRunning?: boolean;
}) {
  const theme = useTheme();
  const { columns } = useTerminalSize();
  const displayPath = formatDisplayPath(cwd);
  const counts = summarizeGoalCountsFromRuns(runs);

  if (columns < SIDE_BY_SIDE_MIN) {
    return (
      <Box flexDirection="column" marginTop={1} marginBottom={1} width={columns}>
        <GoalGradientText text={GOAL_LOGO[0]} />
        <GoalGradientText text={GOAL_LOGO[1]} />
        <GoalGradientText text={GOAL_LOGO[2]} />
        <Box marginTop={1}>
          <Text color={GOAL_SUCCESS} bold>
            Goal Pane
          </Text>
          {agentRunning && <Text color={GOAL_ACTIVE}> (agent running)</Text>}
          <Text color={theme.textDim}> · {basename(cwd)}</Text>
        </Box>
        <Text color={theme.textDim} wrap="truncate">
          {displayPath}
        </Text>
        <Text>
          <Text color={GOAL_SUCCESS}>{counts.passed} passed</Text>
          <Text color={theme.textDim}> · </Text>
          <Text color={GOAL_ACTIVE}>{counts.running} active</Text>
          <Text color={theme.textDim}> · </Text>
          <Text color={theme.text}>{counts.pending} pending</Text>
          <Text color={theme.textDim}> · </Text>
          <Text color={GOAL_ACTIVE}>{counts.blocked} blocked</Text>
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1} width={columns}>
      <Box>
        <GoalGradientText text={GOAL_LOGO[0]} />
        <Text>{GAP}</Text>
        <Text color={GOAL_SUCCESS} bold>
          Goal Pane
        </Text>
        {agentRunning && <Text color={GOAL_ACTIVE}> (agent running)</Text>}
      </Box>
      <Box>
        <GoalGradientText text={GOAL_LOGO[1]} />
        <Text>{GAP}</Text>
        <Text color={theme.textDim} wrap="truncate">
          {displayPath}
        </Text>
      </Box>
      <Box>
        <GoalGradientText text={GOAL_LOGO[2]} />
        <Text>{GAP}</Text>
        <Text>
          <Text color={GOAL_SUCCESS}>{counts.passed} passed</Text>
          <Text color={theme.textDim}> · </Text>
          <Text color={GOAL_ACTIVE}>{counts.running} active</Text>
          <Text color={theme.textDim}> · </Text>
          <Text color={theme.text}>{counts.pending} pending</Text>
          <Text color={theme.textDim}> · </Text>
          <Text color={GOAL_ACTIVE}>{counts.blocked} blocked</Text>
        </Text>
      </Box>
    </Box>
  );
}

function GoalDetail({ run }: { run: GoalRun }) {
  const theme = useTheme();
  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={2}>
      {run.prerequisites.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.textDim} bold>
            {getGoalUserPrerequisiteHeading(run)}
          </Text>
          {run.prerequisites.map((prerequisite) => (
            <Box key={prerequisite.id} flexDirection="column">
              <Text>
                <Text color={prerequisiteStatusColor(prerequisite.status)}>
                  [{prerequisite.status}]
                </Text>
                <Text color={theme.text}> {prerequisite.label}</Text>
                {isBlockingGoalPrerequisite(prerequisite) ? (
                  <Text color={theme.warning}> · required from user</Text>
                ) : null}
              </Text>
              {isBlockingGoalPrerequisite(prerequisite) ? (
                <Text color={theme.textDim} wrap="wrap">
                  {"  "}
                  {formatGoalPrerequisiteInstruction(prerequisite)}
                </Text>
              ) : prerequisite.evidence ? (
                <Text color={theme.textDim} wrap="wrap">
                  {"  "}
                  {prerequisite.evidence}
                </Text>
              ) : null}
            </Box>
          ))}
        </Box>
      ) : null}
      <Text color={theme.textDim} bold>
        {getGoalDetailTaskHeading(run)}
      </Text>
      {run.tasks.length === 0 ? (
        <Text color={theme.textDim}>
          {goalHasBlockingPrerequisites(run)
            ? "Waiting for user prerequisites before worker tasks can begin."
            : "No worker tasks yet."}
        </Text>
      ) : (
        run.tasks.map((task) => (
          <Box key={task.id} flexDirection="column">
            <Text>
              <Text color={taskStatusColor(task.status)}>[{task.status}]</Text>
              <Text color={theme.text}> {task.title}</Text>
              <Text color={theme.textDim}> · attempts {task.attempts}</Text>
              {task.workerId ? <Text color={theme.textDim}> · worker {task.workerId}</Text> : null}
            </Text>
            {task.lastSummary ? (
              <Text color={theme.textDim}> {formatGoalTaskDetailSummary(task.lastSummary)}</Text>
            ) : null}
          </Box>
        ))
      )}
    </Box>
  );
}

export function GoalOverlay({
  cwd,
  onClose,
  onRunGoal,
  onVerifyGoal,
  onPauseGoal,
  agentRunning,
}: GoalOverlayProps) {
  const theme = useTheme();
  const [runs, setRuns] = useState<GoalRun[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [mode, setMode] = useState<"normal" | "adding" | "confirmDelete">("normal");
  const [inputText, setInputText] = useState("");
  const [status, setStatus] = useState("");
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedRunsRef = useRef<GoalRun[]>([]);

  const showStatus = useCallback((message: string) => {
    setStatus(message);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(""), 2500);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void loadGoalRuns(cwd).then((nextRuns) => {
        if (cancelled) return;
        setRuns((previousRuns) => {
          const sorted = sortGoalRunsForOverlay(nextRuns);
          if (!shouldPersistGoalOverlayRuns(previousRuns, sorted)) {
            showStatus(
              "Goal store reload looked empty while work is active; preserving local state.",
            );
            return previousRuns;
          }
          return JSON.stringify(previousRuns) === JSON.stringify(sorted) ? previousRuns : sorted;
        });
        setLoaded(true);
      });
    };
    load();
    const interval = setInterval(load, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (statusTimer.current) clearTimeout(statusTimer.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [cwd]);

  useEffect(() => {
    setSelectedIndex((index) => clampGoalSelectedIndex(index, runs.length));
  }, [runs.length]);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!shouldPersistGoalOverlayRuns(lastPersistedRunsRef.current, runs)) {
        showStatus("Refusing to save an empty Goal list while work is active.");
        return;
      }
      lastPersistedRunsRef.current = runs;
      void saveGoalRuns(cwd, runs);
    }, 100);
  }, [cwd, loaded, runs]);

  const selectedRun = runs[selectedIndex];
  const expandedRun = selectedRun && selectedRun.id === expandedRunId ? selectedRun : null;

  useInput((input, key) => {
    if (mode === "adding") {
      if (key.escape) {
        setMode("normal");
        setInputText("");
        return;
      }
      if (key.return) {
        const text = inputText.trim();
        if (text) {
          const run = createGoalRun(cwd, {
            id: randomUUID(),
            title: text.slice(0, 80),
            goal: text,
            status: "draft",
            successCriteria: [],
            prerequisites: [],
            harness: [],
            tasks: [],
            evidence: [],
            blockers: [],
          });
          setRuns((previousRuns) => sortGoalRunsForOverlay([run, ...previousRuns]));
          setSelectedIndex(0);
          showStatus("Draft goal added");
        }
        setMode("normal");
        setInputText("");
        return;
      }
      if (key.backspace || key.delete) {
        setInputText((previous) => previous.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) setInputText((previous) => previous + input);
      return;
    }

    if (mode === "confirmDelete") {
      if (key.escape || input === "n") {
        setMode("normal");
        showStatus("Archive cancelled");
        return;
      }
      if (input === "y" && selectedRun) {
        setRuns((previousRuns) => previousRuns.filter((run) => run.id !== selectedRun.id));
        setExpandedRunId(null);
        setMode("normal");
        showStatus("Goal archived");
      }
      return;
    }

    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((index) => clampGoalSelectedIndex(index - 1, runs.length));
      return;
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((index) => clampGoalSelectedIndex(index + 1, runs.length));
      return;
    }
    if ((key.return || input === "d") && selectedRun) {
      setExpandedRunId((current) => (current === selectedRun.id ? null : selectedRun.id));
      return;
    }
    if (input === "r" && selectedRun) {
      onRunGoal(selectedRun);
      return;
    }
    if (input === "v" && selectedRun) {
      onVerifyGoal(selectedRun);
      return;
    }
    if (input === "p" && selectedRun) {
      onPauseGoal(selectedRun);
      return;
    }
    if (input === "a") {
      setMode("adding");
      setInputText("");
      return;
    }
    if (input === "x" && selectedRun) {
      setMode("confirmDelete");
      showStatus("Archive goal? y/n");
    }
  });

  return (
    <Box flexDirection="column">
      <GoalHeader cwd={cwd} runs={runs} agentRunning={agentRunning} />

      {agentRunning ? (
        <Box marginBottom={1}>
          <Text color={theme.textDim}>
            Agent is running; Goal pane stays available without resetting chat.
          </Text>
        </Box>
      ) : null}

      {!loaded ? (
        <Text color={theme.textDim}>Loading goals…</Text>
      ) : runs.length === 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.textDim}>No goals. Run /goal &lt;objective&gt; or press (a)dd.</Text>
          {mode === "adding" ? <Text color={theme.primary}>New goal: {inputText}</Text> : null}
        </Box>
      ) : (
        <Box flexDirection="column">
          {runs.map((run, index) => {
            const selected = index === selectedIndex;
            const blocked = goalHasBlockingPrerequisites(run);
            return (
              <Box key={run.id} flexDirection="column" marginBottom={1}>
                <Text>
                  <Text color={selected ? theme.primary : theme.textDim}>
                    {selected ? "❯ " : "  "}
                  </Text>
                  <Text color={statusColor(run.status) || (selected ? theme.primary : theme.text)}>
                    [{run.status}]
                  </Text>
                  <Text color={selected ? theme.primary : theme.text} bold={selected}>
                    {" "}
                    {run.title}
                  </Text>
                  <Text color={theme.textDim}> · {run.id.slice(0, 8)}</Text>
                  {blocked ? <Text color={theme.warning}> · blocked</Text> : null}
                </Text>
                <Text color={theme.textDim}>
                  {"    "}
                  {formatGoalPrerequisiteSummary(run)} · {formatGoalTaskSummary(run)} ·{" "}
                  {formatGoalVerifierSummary(run)}
                </Text>
                {run.blockers.length > 0 ? (
                  <Text color={theme.warning}>
                    {"    "}blocker: {run.blockers[0]}
                  </Text>
                ) : null}
                {expandedRun?.id === run.id ? <GoalDetail run={run} /> : null}
              </Box>
            );
          })}
          {mode === "adding" ? <Text color={theme.primary}>New goal: {inputText}</Text> : null}
        </Box>
      )}

      <Box marginTop={1}>
        {mode === "confirmDelete" ? (
          <Text color={theme.warning}>Confirm archive selected goal: y/n</Text>
        ) : mode === "adding" ? (
          <Text color={theme.textDim}>
            <Text color={theme.primary}>Enter</Text>
            {" add · "}
            <Text color={theme.primary}>ESC</Text>
            {" cancel"}
          </Text>
        ) : (
          <Text color={theme.textDim}>
            <Text color={theme.primary}>↑↓</Text>
            {" move · ("}
            <Text color={theme.primary}>d</Text>
            {")etail · ("}
            <Text color={theme.primary}>r</Text>
            {")un · ("}
            <Text color={theme.primary}>v</Text>
            {")erify · ("}
            <Text color={theme.primary}>p</Text>
            {")ause · ("}
            <Text color={theme.primary}>a</Text>
            {")dd · ("}
            <Text color={theme.primary}>x</Text>
            {")archive · "}
            <Text color={theme.primary}>ESC</Text>
            {" close"}
          </Text>
        )}
      </Box>
      {status ? (
        <Box>
          <Text color={theme.secondary}>{status}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
