/**
 * Autopilot gate — pure decision logic for whether Ken's auto-review cycle may
 * start after a finished GG Coder turn.
 *
 * Autopilot must NOT review every turn. The concrete leak cases this gate
 * closes (each has a matching unit test in autopilot-gate.test.ts):
 *
 * - Workflow slash commands (`/compare`, `/bullet-proof`, `/expand`, custom
 *   `.gg/commands/*.md`) end with reports or A/B/C choices that are reserved
 *   for the USER. Ken reviewing them reads "findings" as "something real is
 *   wrong" and injects fix prompts the user never approved.
 * - Registry commands (`/help`, `/session`, unknown `/foo`) and failed runs
 *   add no assistant work at all — a review would judge the PREVIOUS turn
 *   again (Ken's cycle memory is wiped per turn) and can flip a settled
 *   ALL_CLEAR into a fresh PROMPT.
 * - A turn that ended in plan mode has a pending Accept/Reject modal; Ken must
 *   never inject a prompt into a read-only plan-mode session.
 *
 * Kept pure + dependency-light so it's unit-testable without booting the
 * sidecar (which runs `main()` at import time).
 */

/** A workflow (prompt-template) command: built-in PROMPT_COMMANDS or a custom
 *  `.gg/commands/*.md` entry. `prompt` is the full template body the command
 *  expands to when run. */
export interface WorkflowCommandSpec {
  name: string;
  aliases?: readonly string[];
  prompt: string;
}

/** The exact separator AgentSession.prompt() inserts between a command's
 *  template and the user's extra args (see agent-session.ts prompt expansion).
 *  Must stay byte-identical or expanded-command detection silently breaks. */
export const USER_INSTRUCTIONS_HEADER = "\n\n## User Instructions\n\n";

/** Extract the `/name` token from raw input, or null when it isn't a slash
 *  invocation. */
function parseSlashName(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const name = trimmed.slice(1).split(/\s/, 1)[0]?.toLowerCase() ?? "";
  return name.length > 0 ? name : null;
}

/**
 * True when `text` invokes a known workflow command (first token, name or
 * alias, case-insensitive). Registry/UI commands and unknown `/foo` return
 * false — those add no assistant work and are caught by the
 * `no-assistant-output` gate instead.
 */
export function isWorkflowCommandText(
  text: string,
  commands: readonly WorkflowCommandSpec[],
): boolean {
  const name = parseSlashName(text);
  if (!name) return false;
  return commands.some(
    (c) => c.name.toLowerCase() === name || (c.aliases ?? []).some((a) => a.toLowerCase() === name),
  );
}

/**
 * Match a transcript user-message body back to the workflow command it was
 * expanded from. AgentSession stores the EXPANDED template as a plain user
 * message, so without this Ken's digest renders 400-line templates as
 * `**User:** …` and treats them as user-authored asks.
 *
 * Returns the matched command plus any trailing user args, or null.
 */
export function matchExpandedCommand(
  text: string,
  commands: readonly WorkflowCommandSpec[],
): { command: WorkflowCommandSpec; args: string | null } | null {
  for (const command of commands) {
    if (!command.prompt) continue;
    if (text === command.prompt) return { command, args: null };
    const prefix = command.prompt + USER_INSTRUCTIONS_HEADER;
    if (text.startsWith(prefix)) {
      const args = text.slice(prefix.length).trim();
      return { command, args: args.length > 0 ? args : null };
    }
  }
  return null;
}

/** Count assistant messages — the "did this run produce reviewable work"
 *  signal. Compared before/after a run by the sidecar. */
export function countAssistantMessages(messages: ReadonlyArray<{ role: string }>): number {
  let count = 0;
  for (const m of messages) if (m.role === "assistant") count++;
  return count;
}

export type AutopilotSkipReason =
  | "disabled"
  | "cancelled"
  | "plan-mode"
  | "workflow-command"
  | "no-assistant-output";

export interface AutopilotGateInput {
  /** The window's autopilot toggle. */
  enabled: boolean;
  /** True when /cancel fired during the turn. */
  cancelled: boolean;
  /** True when the session ended the turn in plan mode (plan modal pending). */
  planMode: boolean;
  /** True when the turn was a workflow slash command (see isWorkflowCommandText). */
  workflowCommand: boolean;
  /** Assistant messages ADDED by this turn (after minus before). */
  assistantMessagesAdded: number;
}

export type AutopilotGateDecision = { start: true } | { start: false; reason: AutopilotSkipReason };

/**
 * Decide whether the autopilot cycle may start for a just-finished turn.
 * Checks are ordered cheapest/most-fundamental first; the reason is logged by
 * the sidecar so skips are debuggable from gg-app-sidecar.log.
 */
export function shouldStartAutopilotCycle(input: AutopilotGateInput): AutopilotGateDecision {
  if (!input.enabled) return { start: false, reason: "disabled" };
  if (input.cancelled) return { start: false, reason: "cancelled" };
  if (input.planMode) return { start: false, reason: "plan-mode" };
  if (input.workflowCommand) return { start: false, reason: "workflow-command" };
  if (input.assistantMessagesAdded <= 0) return { start: false, reason: "no-assistant-output" };
  return { start: true };
}
