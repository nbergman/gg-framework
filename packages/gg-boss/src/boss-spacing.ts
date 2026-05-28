/**
 * Single source of truth for gg-boss transcript spacing. Both the live pane
 * (boss-transcript-rows.tsx) and the finalized scrollback printer
 * (boss-terminal-history.tsx) consume these so an item gets the SAME blank-line
 * treatment while streaming as it does once committed to history — no visual
 * jump as live rows flush into Static.
 *
 * `BOSS_SPACING_KINDS` are the item kinds that participate in spacing at all.
 * `BOSS_COMPACT_BOUNDARIES` are the `previous→current` transitions that should
 * stay tight (no blank line) — boss keeps tool bursts and assistant→tool
 * hand-offs compact since the boss fires many small orchestration calls.
 */
export const BOSS_SPACING_KINDS: ReadonlySet<string> = new Set<string>([
  "user",
  "assistant",
  "tool_start",
  "tool_done",
  "tool_group",
  "worker_event",
  "worker_error",
  "task_dispatch",
  "info",
  "update_notice",
  "compacting",
  "compacted",
  "stopped",
]);

export const BOSS_COMPACT_BOUNDARIES: ReadonlySet<string> = new Set<string>([
  "user→assistant",
  "assistant→user",
  "user→queued",
  "assistant→assistant",
  "assistant→tool_start",
  "assistant→tool_done",
  "assistant→tool_group",
  "tool_start→tool_done",
  "tool_done→tool_start",
  "tool_done→tool_done",
  "tool_group→tool_group",
  "tool_group→tool_start",
  "tool_group→tool_done",
  "tool_done→tool_group",
  "tool_start→tool_group",
]);
