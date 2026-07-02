/**
 * Autopilot cycle — the review→prompt→review loop as pure orchestration logic.
 *
 * The sidecar wires the real dependencies (kenAuto session, runAgent, SSE
 * broadcast); this module owns the loop's control flow so every exit path is
 * unit-testable without booting the sidecar: verdict handling, the round cap,
 * cancellation between steps, review failure, and the mid-cycle plan-mode hold
 * (an injected run calling enter_plan/exit_plan must halt the loop — Ken can
 * never inject a prompt into a read-only plan-mode session or answer a pending
 * plan-review modal on the user's behalf).
 */
import type { AutopilotVerdict } from "./autopilot-verdict.js";

/** Reason shown in the Ken bubble when an injected run enters plan mode
 *  mid-cycle — the loop halts and hands the decision to the user. */
export const AUTOPILOT_PLAN_HOLD_REASON =
  "GG Coder submitted a plan for your review. Approve or reject it yourself; autopilot won't decide that for you.";

/** SSE frame types the cycle can emit (matched by the webview). */
export type AutopilotCycleEmit =
  | { type: "autopilot_done"; data: Record<string, never> }
  | { type: "autopilot_ignored"; data: Record<string, never> }
  | { type: "autopilot_human"; data: { reason: string } }
  | { type: "autopilot_capped"; data: { rounds: number } };

export interface AutopilotCycleDeps {
  /** Hard cap on review→prompt rounds per user turn (loop safety). */
  maxRounds: number;
  /** True once /cancel fires — checked between every step. */
  isCancelled: () => boolean;
  /** Live plan-mode state of the BUILD session. */
  isPlanMode: () => boolean;
  /** Wipe the reviewer's history so each user turn starts cheap (within one
   *  cycle the review messages persist so Ken remembers what he asked). */
  resetReviewer: () => Promise<void>;
  /** Run one review; resolves to the parsed verdict or null on failure
   *  (failure is already surfaced by the sidecar as autopilot_error). */
  review: () => Promise<AutopilotVerdict | null>;
  /** Feed a PROMPT verdict's body to GG Coder as an injected run. */
  runPrompt: (body: string) => Promise<void>;
  /** Called BEFORE runPrompt: record the injected body (digest labeling) and
   *  broadcast the autopilot_prompted marker. */
  onInjected: (body: string, round: number) => void;
  /** Broadcast one of the cycle's terminal SSE frames. */
  emit: (event: AutopilotCycleEmit) => void;
}

/**
 * Drive one full autopilot cycle for a finished user turn. Every exit is
 * explicit:
 *  - cancelled            → silent stop (the /cancel path already broadcast)
 *  - plan mode mid-cycle  → autopilot_human with the plan-hold reason
 *  - review failed (null) → silent stop (autopilot_error already broadcast)
 *  - ALL_CLEAR            → autopilot_done
 *  - IGNORE               → autopilot_ignored (renders nothing)
 *  - HUMAN                → autopilot_human
 *  - rounds exhausted     → autopilot_capped
 */
export async function driveAutopilotCycle(deps: AutopilotCycleDeps): Promise<void> {
  if (deps.isCancelled()) return;
  await deps.resetReviewer();
  for (let round = 1; round <= deps.maxRounds; round++) {
    if (deps.isCancelled()) return;
    // The gate blocks a plan-mode turn up front, so hitting this means an
    // injected run entered plan mode mid-cycle: halt and hand it to the user.
    if (deps.isPlanMode()) {
      deps.emit({ type: "autopilot_human", data: { reason: AUTOPILOT_PLAN_HOLD_REASON } });
      return;
    }
    const verdict = await deps.review();
    if (!verdict || deps.isCancelled()) return;
    if (verdict.kind === "all_clear") {
      deps.emit({ type: "autopilot_done", data: {} });
      return;
    }
    if (verdict.kind === "ignore") {
      deps.emit({ type: "autopilot_ignored", data: {} });
      return;
    }
    if (verdict.kind === "human") {
      deps.emit({ type: "autopilot_human", data: { reason: verdict.reason } });
      return;
    }
    deps.onInjected(verdict.body, round);
    await deps.runPrompt(verdict.body);
    if (deps.isCancelled()) return;
  }
  deps.emit({ type: "autopilot_capped", data: { rounds: deps.maxRounds } });
}
