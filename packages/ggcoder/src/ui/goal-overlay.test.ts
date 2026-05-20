import { describe, expect, it } from "vitest";
import type { GoalRun } from "../core/goal-store.js";
import {
  clampGoalSelectedIndex,
  formatGoalPrerequisiteSummary,
  formatGoalTaskDetailSummary,
  formatGoalTaskSummary,
  formatGoalVerifierSummary,
  getGoalDetailTaskHeading,
  getGoalStatusCountsText,
  getGoalUserPrerequisiteHeading,
  shouldPersistGoalOverlayRuns,
  sortGoalRunsForOverlay,
} from "./components/GoalOverlay.js";

function goalRun(overrides: Partial<GoalRun>): GoalRun {
  return {
    id: "goal-1",
    title: "Goal",
    goal: "Goal text",
    status: "ready",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    projectPath: "/tmp/project",
    successCriteria: [],
    prerequisites: [],
    harness: [],
    evidencePlan: [],
    tasks: [],
    evidence: [],
    blockers: [],
    ...overrides,
  };
}

describe("goal overlay helpers", () => {
  it("sorts runs newest first", () => {
    const oldRun = goalRun({ id: "old", updatedAt: "2024-01-01T00:00:00.000Z" });
    const newRun = goalRun({ id: "new", updatedAt: "2024-02-01T00:00:00.000Z" });

    expect(sortGoalRunsForOverlay([oldRun, newRun]).map((run) => run.id)).toEqual(["new", "old"]);
  });

  it("clamps selected index", () => {
    expect(clampGoalSelectedIndex(3, 0)).toBe(0);
    expect(clampGoalSelectedIndex(-1, 3)).toBe(0);
    expect(clampGoalSelectedIndex(4, 3)).toBe(2);
    expect(clampGoalSelectedIndex(1, 3)).toBe(1);
  });

  it("summarizes prerequisites including blocking states", () => {
    const run = goalRun({
      prerequisites: [
        { id: "cli", label: "CLI", status: "met" },
        { id: "sim", label: "Simulator", status: "missing" },
        { id: "data", label: "Fixture data", status: "unknown" },
      ],
    });

    expect(formatGoalPrerequisiteSummary(run)).toBe("1/3 prereqs met (1 missing, 1 unknown)");
  });

  it("puts user prerequisites before worker tasks in detail headings", () => {
    const run = goalRun({
      prerequisites: [
        {
          id: "supabase-token",
          label: "Supabase token",
          status: "missing",
          instructions: "Provide SUPABASE_ACCESS_TOKEN.",
        },
      ],
    });

    expect(getGoalUserPrerequisiteHeading(run)).toBe("1. User prerequisites");
    expect(getGoalDetailTaskHeading(run)).toBe("2. Worker tasks");
    expect(getGoalUserPrerequisiteHeading(goalRun({}))).toBeNull();
    expect(getGoalDetailTaskHeading(goalRun({}))).toBe("Worker tasks");
  });

  it("summarizes task states", () => {
    const run = goalRun({
      tasks: [
        { id: "a", title: "A", prompt: "A", status: "done", attempts: 1 },
        { id: "b", title: "B", prompt: "B", status: "running", attempts: 2 },
        { id: "c", title: "C", prompt: "C", status: "failed", attempts: 1 },
        { id: "d", title: "D", prompt: "D", status: "blocked", attempts: 0 },
      ],
    });

    expect(formatGoalTaskSummary(run)).toBe("1/4 tasks done (1 running, 1 failed, 1 blocked)");
  });

  it("summarizes task detail with only the first concise line", () => {
    expect(formatGoalTaskDetailSummary("\nChanged the harness.\nVerified tests.")).toBe(
      "Changed the harness.",
    );
    expect(formatGoalTaskDetailSummary("\n\n")).toBe("");
    expect(formatGoalTaskDetailSummary("x".repeat(220))).toBe(`${"x".repeat(177)}…`);
  });

  it("summarizes verifier state", () => {
    expect(formatGoalVerifierSummary(goalRun({}))).toBe("no verifier");
    expect(
      formatGoalVerifierSummary(
        goalRun({ verifier: { description: "Run tests", command: "pnpm test" } }),
      ),
    ).toBe("verifier command ready");
    expect(
      formatGoalVerifierSummary(
        goalRun({
          verifier: {
            description: "Run tests",
            lastResult: {
              status: "pass",
              summary: "passed",
              checkedAt: "2024-01-01T00:00:00.000Z",
            },
          },
        }),
      ),
    ).toBe("verifier pass");
  });

  it("formats status counts for header", () => {
    const runs = [
      goalRun({ id: "passed", status: "passed" }),
      goalRun({ id: "running", status: "running" }),
      goalRun({ id: "paused", status: "paused" }),
      goalRun({ id: "blocked", status: "blocked" }),
    ];

    expect(getGoalStatusCountsText(runs)).toBe("1 passed · 1 running · 1 pending · 1 blocked");
  });

  it("refuses to persist a transient empty overlay state while active Goal work exists", () => {
    const activeRuns = [
      goalRun({
        id: "active",
        status: "running",
        activeWorkerId: "worker-a",
        tasks: [
          {
            id: "task-a",
            title: "Active work",
            prompt: "Do work",
            status: "running",
            attempts: 1,
            workerId: "worker-a",
          },
        ],
      }),
    ];

    expect(shouldPersistGoalOverlayRuns(activeRuns, [])).toBe(false);
    expect(shouldPersistGoalOverlayRuns(activeRuns, [goalRun({ id: "next" })])).toBe(true);
    expect(shouldPersistGoalOverlayRuns([goalRun({ id: "done", status: "passed" })], [])).toBe(
      true,
    );
  });
});
