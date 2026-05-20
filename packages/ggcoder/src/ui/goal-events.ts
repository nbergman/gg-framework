import { DEFAULT_GOAL_VERIFIER_FIX_LIMIT } from "../core/goal-controller.js";
import {
  formatGoalBlockingPrerequisites,
  goalHasBlockingPrerequisites,
  type GoalRun,
} from "../core/goal-store.js";
import type { GoalWorkerCompletion } from "../core/goal-worker.js";

export const GOAL_WORKER_EVENT_PREFIX = "[event:goal_worker_complete]";
export const GOAL_VERIFIER_EVENT_PREFIX = "[event:goal_verifier_complete]";

export type GoalSyntheticEventKind = "worker" | "verifier";

export interface GoalSyntheticEventInfo {
  kind: GoalSyntheticEventKind;
  runId?: string;
  goal?: string;
  task?: string;
  worker?: string;
  status?: string;
  exitCode?: number;
}

const GOAL_ORCHESTRATOR_INSTRUCTIONS = `orchestrator_instructions:
1. Call goals({ action: "status", run_id }) before deciding.
2. Briefly say what the orchestrator is doing so the chat shows progress.
3. Inspect durable tasks, verifier state, blockers, and evidence.
4. Take exactly one next control-loop action: add/update the next Goal task, run/record verification, pause/block with evidence, or complete only if verifier evidence proves the success criteria.
5. Do not merely narrate and do not ask the user to open the Goal pane.`;

function formatGoalState(run: GoalRun): string {
  const tasks =
    run.tasks
      .map((task) => `- ${task.id}: ${task.status}; attempts=${task.attempts}; title=${task.title}`)
      .join("\n") || "(none)";
  const blockers =
    run.blockers.length > 0 ? run.blockers.map((b) => `- ${b}`).join("\n") : "(none)";
  const verifier = run.verifier?.command
    ? `${run.verifier.command}; last=${run.verifier.lastResult?.status ?? "none"}; output=${run.verifier.lastResult?.outputPath ?? "none"}`
    : "(none - define an exact verifier before completion)";
  const prerequisites = run.prerequisites.length
    ? run.prerequisites
        .map(
          (item) =>
            `- ${item.id}: ${item.status}; ${item.label}${item.instructions ? `; instructions=${item.instructions}` : ""}${item.evidence ? `; evidence=${item.evidence}` : ""}`,
        )
        .join("\n")
    : "(none)";
  const userPrerequisites = goalHasBlockingPrerequisites(run)
    ? formatGoalBlockingPrerequisites(run)
    : "(none)";
  const evidencePlan = run.evidencePlan.length
    ? run.evidencePlan.map((item) => `- ${item.id}: ${item.status}; ${item.label}`).join("\n")
    : "(none)";
  return `current_goal_state:\nstatus: ${run.status}\nuser_prerequisites: ${userPrerequisites}\nverifier: ${verifier}\nblockers:\n${blockers}\nprerequisites:\n${prerequisites}\nevidence_plan:\n${evidencePlan}\ntasks:\n${tasks}`;
}

export function formatGoalWorkerCompletionEvent(
  run: GoalRun,
  taskTitle: string,
  completion: GoalWorkerCompletion,
): string {
  const summary = completion.summary.trim() || "(empty)";
  const toolsUsed =
    completion.toolsUsed.length > 0
      ? completion.toolsUsed.map((tool) => `${tool.ok ? "✓" : "✗"}${tool.name}`).join(", ")
      : "(none)";
  const reason = completion.reason ? ` reason=${completion.reason}` : "";
  return `${GOAL_WORKER_EVENT_PREFIX} run_id="${run.id}" goal="${run.title}" task_id="${completion.worker.goalTaskId}" task="${taskTitle}" worker="${completion.worker.id}" status=${completion.status} exit_code=${completion.exitCode}${reason}
tools_used: ${toolsUsed}
${formatGoalState(run)}
summary:
${summary}

${GOAL_ORCHESTRATOR_INSTRUCTIONS}`;
}

export function formatGoalVerifierCompletionEvent(
  run: GoalRun,
  status: "pass" | "fail",
  command: string,
  exitCode: number,
  summary: string,
): string {
  const fixCount = run.tasks.filter((task) => task.title === "Fix verifier failure").length;
  const outputPath = run.verifier?.lastResult?.outputPath ?? "not recorded";
  return `${GOAL_VERIFIER_EVENT_PREFIX} run_id="${run.id}" goal="${run.title}" status=${status} exit_code=${exitCode}
command: ${command}
output_path: ${outputPath}
fix_attempts: ${fixCount}/${DEFAULT_GOAL_VERIFIER_FIX_LIMIT}
completion_guidance: ${status === "pass" ? "Complete only if goals(status) shows success criteria, required evidence, and verifier output match the original objective exactly." : "Create one bounded fix task with the verifier command, exit code, output path, and failure summary unless the limit or repeated-failure guard is reached."}
${formatGoalState(run)}
summary:
${summary.trim() || "(empty)"}

${GOAL_ORCHESTRATOR_INSTRUCTIONS}`;
}

export function isGoalSyntheticEvent(text: string): boolean {
  return text.startsWith(GOAL_WORKER_EVENT_PREFIX) || text.startsWith(GOAL_VERIFIER_EVENT_PREFIX);
}

function quotedField(text: string, field: string): string | undefined {
  const match = new RegExp(`${field}="([^"]*)"`).exec(text);
  return match?.[1];
}

function tokenField(text: string, field: string): string | undefined {
  const match = new RegExp(`${field}=([^\\s\\n]+)`).exec(text);
  return match?.[1];
}

export function parseGoalSyntheticEvent(text: string): GoalSyntheticEventInfo | null {
  const kind = text.startsWith(GOAL_WORKER_EVENT_PREFIX)
    ? "worker"
    : text.startsWith(GOAL_VERIFIER_EVENT_PREFIX)
      ? "verifier"
      : null;
  if (kind === null) return null;

  const exitCodeRaw = tokenField(text, "exit_code");
  const exitCode = exitCodeRaw === undefined ? undefined : Number(exitCodeRaw);
  return {
    kind,
    ...(quotedField(text, "run_id") ? { runId: quotedField(text, "run_id") } : {}),
    ...(quotedField(text, "goal") ? { goal: quotedField(text, "goal") } : {}),
    ...(quotedField(text, "task") ? { task: quotedField(text, "task") } : {}),
    ...(quotedField(text, "worker") ? { worker: quotedField(text, "worker") } : {}),
    ...(tokenField(text, "status") ? { status: tokenField(text, "status") } : {}),
    ...(exitCode !== undefined && Number.isFinite(exitCode) ? { exitCode } : {}),
  };
}

export function shouldContinueGoalRun(run: GoalRun): boolean {
  if (
    run.status === "blocked" ||
    run.status === "paused" ||
    run.status === "passed" ||
    run.status === "failed"
  ) {
    return false;
  }
  if (run.activeWorkerId) return false;
  return !run.tasks.some((task) => task.status === "running");
}
