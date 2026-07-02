import { describe, it, expect, vi } from "vitest";
import {
  driveAutopilotCycle,
  AUTOPILOT_PLAN_HOLD_REASON,
  type AutopilotCycleDeps,
  type AutopilotCycleEmit,
} from "./autopilot-cycle.js";
import type { AutopilotVerdict } from "./autopilot-verdict.js";

/** Build a full deps object with sane defaults; tests override what they probe.
 *  `verdicts` is consumed in order; running out returns null (review failure). */
function makeDeps(
  verdicts: Array<AutopilotVerdict | null>,
  overrides: Partial<AutopilotCycleDeps> = {},
): AutopilotCycleDeps & {
  emitted: AutopilotCycleEmit[];
  injected: Array<{ body: string; round: number }>;
  ran: string[];
  resetReviewer: ReturnType<typeof vi.fn<() => Promise<void>>>;
  review: ReturnType<typeof vi.fn<() => Promise<AutopilotVerdict | null>>>;
} {
  const emitted: AutopilotCycleEmit[] = [];
  const injected: Array<{ body: string; round: number }> = [];
  const ran: string[] = [];
  const queue = [...verdicts];
  const deps = {
    maxRounds: 3,
    isCancelled: () => false,
    isPlanMode: () => false,
    resetReviewer: vi.fn(async () => {}),
    review: vi.fn(async () => queue.shift() ?? null),
    runPrompt: async (body: string) => {
      ran.push(body);
    },
    onInjected: (body: string, round: number) => {
      injected.push({ body, round });
    },
    emit: (event: AutopilotCycleEmit) => {
      emitted.push(event);
    },
    ...overrides,
  };
  // Overrides may swap the vi.fn defaults for plain functions; every test that
  // asserts on mock calls passes a vi.fn itself, so the cast is safe.
  return Object.assign(deps, { emitted, injected, ran }) as AutopilotCycleDeps & {
    emitted: AutopilotCycleEmit[];
    injected: Array<{ body: string; round: number }>;
    ran: string[];
    resetReviewer: ReturnType<typeof vi.fn<() => Promise<void>>>;
    review: ReturnType<typeof vi.fn<() => Promise<AutopilotVerdict | null>>>;
  };
}

describe("driveAutopilotCycle", () => {
  it("ALL_CLEAR → autopilot_done, no injected run", async () => {
    const deps = makeDeps([{ kind: "all_clear" }]);
    await driveAutopilotCycle(deps);
    expect(deps.emitted).toEqual([{ type: "autopilot_done", data: {} }]);
    expect(deps.ran).toEqual([]);
    expect(deps.resetReviewer).toHaveBeenCalledTimes(1);
  });

  it("IGNORE → autopilot_ignored, no injected run", async () => {
    const deps = makeDeps([{ kind: "ignore" }]);
    await driveAutopilotCycle(deps);
    expect(deps.emitted).toEqual([{ type: "autopilot_ignored", data: {} }]);
    expect(deps.ran).toEqual([]);
  });

  it("HUMAN → autopilot_human with the verdict's reason", async () => {
    const deps = makeDeps([{ kind: "human", reason: "ambiguous requirement" }]);
    await driveAutopilotCycle(deps);
    expect(deps.emitted).toEqual([
      { type: "autopilot_human", data: { reason: "ambiguous requirement" } },
    ]);
    expect(deps.ran).toEqual([]);
  });

  it("PROMPT → records the injection BEFORE running, then re-reviews", async () => {
    const order: string[] = [];
    const deps = makeDeps([{ kind: "prompt", body: "fix the test" }, { kind: "all_clear" }], {
      onInjected: (body) => order.push(`injected:${body}`),
      runPrompt: async (body) => {
        order.push(`ran:${body}`);
      },
    });
    await driveAutopilotCycle(deps);
    // onInjected must precede runPrompt — the digest labeling depends on the
    // body being recorded before the injected run's messages exist.
    expect(order).toEqual(["injected:fix the test", "ran:fix the test"]);
    expect(deps.emitted).toEqual([{ type: "autopilot_done", data: {} }]);
    expect(deps.review).toHaveBeenCalledTimes(2);
  });

  it("caps at maxRounds PROMPT verdicts → autopilot_capped", async () => {
    const deps = makeDeps([
      { kind: "prompt", body: "fix 1" },
      { kind: "prompt", body: "fix 2" },
      { kind: "prompt", body: "fix 3" },
      // Would be round 4 — must never be reached.
      { kind: "prompt", body: "fix 4" },
    ]);
    await driveAutopilotCycle(deps);
    expect(deps.ran).toEqual(["fix 1", "fix 2", "fix 3"]);
    expect(deps.emitted).toEqual([{ type: "autopilot_capped", data: { rounds: 3 } }]);
    expect(deps.review).toHaveBeenCalledTimes(3);
  });

  it("review failure (null) → silent stop, nothing injected", async () => {
    const deps = makeDeps([null]);
    await driveAutopilotCycle(deps);
    expect(deps.emitted).toEqual([]);
    expect(deps.ran).toEqual([]);
  });

  it("cancelled before start → nothing runs, reviewer untouched", async () => {
    const deps = makeDeps([{ kind: "all_clear" }], { isCancelled: () => true });
    await driveAutopilotCycle(deps);
    expect(deps.resetReviewer).not.toHaveBeenCalled();
    expect(deps.review).not.toHaveBeenCalled();
    expect(deps.emitted).toEqual([]);
  });

  it("cancel landing during the review discards the verdict", async () => {
    let cancelled = false;
    const deps = makeDeps([], {
      review: vi.fn(async () => {
        cancelled = true; // /cancel fires while Ken is reviewing
        return { kind: "prompt", body: "fix it" } as AutopilotVerdict;
      }),
      isCancelled: () => cancelled,
    });
    await driveAutopilotCycle(deps);
    expect(deps.ran).toEqual([]);
    expect(deps.emitted).toEqual([]);
  });

  it("cancel landing during an injected run stops before the next review", async () => {
    let cancelled = false;
    const deps = makeDeps([{ kind: "prompt", body: "fix it" }, { kind: "all_clear" }], {
      runPrompt: async () => {
        cancelled = true; // /cancel fires mid-injected-run
      },
      isCancelled: () => cancelled,
    });
    await driveAutopilotCycle(deps);
    expect(deps.review).toHaveBeenCalledTimes(1);
    expect(deps.emitted).toEqual([]);
  });

  it("plan mode at cycle start → autopilot_human plan hold, no review", async () => {
    const deps = makeDeps([{ kind: "all_clear" }], { isPlanMode: () => true });
    await driveAutopilotCycle(deps);
    expect(deps.review).not.toHaveBeenCalled();
    expect(deps.emitted).toEqual([
      { type: "autopilot_human", data: { reason: AUTOPILOT_PLAN_HOLD_REASON } },
    ]);
  });

  it("injected run entering plan mode halts the loop before the next review", async () => {
    let planMode = false;
    const ran: string[] = [];
    const deps = makeDeps(
      [
        { kind: "prompt", body: "restructure the module" },
        // Would be reviewed in round 2 — must never be reached.
        { kind: "prompt", body: "another fix" },
      ],
      {
        runPrompt: async (body) => {
          ran.push(body);
          planMode = true; // GG Coder called enter_plan/exit_plan during the run
        },
        isPlanMode: () => planMode,
      },
    );
    await driveAutopilotCycle(deps);
    expect(ran).toEqual(["restructure the module"]);
    expect(deps.review).toHaveBeenCalledTimes(1);
    expect(deps.emitted).toEqual([
      { type: "autopilot_human", data: { reason: AUTOPILOT_PLAN_HOLD_REASON } },
    ]);
  });

  it("multi-round: prompt → prompt → all_clear runs both fixes then finishes", async () => {
    const deps = makeDeps([
      { kind: "prompt", body: "fix 1" },
      { kind: "prompt", body: "fix 2" },
      { kind: "all_clear" },
    ]);
    await driveAutopilotCycle(deps);
    expect(deps.ran).toEqual(["fix 1", "fix 2"]);
    expect(deps.injected.map((i) => i.round)).toEqual([1, 2]);
    expect(deps.emitted).toEqual([{ type: "autopilot_done", data: {} }]);
  });

  it("resets the reviewer exactly once per cycle, before any review", async () => {
    const order: string[] = [];
    const deps = makeDeps([{ kind: "prompt", body: "fix" }, { kind: "all_clear" }], {
      resetReviewer: vi.fn(async () => {
        order.push("reset");
      }),
      runPrompt: async () => {
        order.push("run");
      },
    });
    // Wrap review to trace ordering while preserving queue behavior.
    const innerReview = deps.review;
    deps.review = vi.fn(async () => {
      order.push("review");
      return innerReview();
    });
    await driveAutopilotCycle(deps);
    expect(order).toEqual(["reset", "review", "run", "review"]);
  });
});
