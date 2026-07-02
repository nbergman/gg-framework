import { describe, it, expect } from "vitest";
import {
  isWorkflowCommandText,
  matchExpandedCommand,
  countAssistantMessages,
  shouldStartAutopilotCycle,
  USER_INSTRUCTIONS_HEADER,
  type WorkflowCommandSpec,
} from "./autopilot-gate.js";
import { PROMPT_COMMANDS } from "./prompt-commands.js";

const COMMANDS: WorkflowCommandSpec[] = [
  { name: "compare", aliases: [], prompt: "Compare the code you just created…" },
  { name: "bullet-proof", aliases: ["bp"], prompt: "Audit the project…" },
];

describe("isWorkflowCommandText", () => {
  it("matches a bare command", () => {
    expect(isWorkflowCommandText("/compare", COMMANDS)).toBe(true);
  });

  it("matches a command with trailing args", () => {
    expect(isWorkflowCommandText("/compare src/foo.ts please", COMMANDS)).toBe(true);
  });

  it("matches aliases and is case-insensitive", () => {
    expect(isWorkflowCommandText("/bp", COMMANDS)).toBe(true);
    expect(isWorkflowCommandText("/COMPARE", COMMANDS)).toBe(true);
    expect(isWorkflowCommandText("/Bullet-Proof", COMMANDS)).toBe(true);
  });

  it("tolerates leading whitespace (matches trim semantics of the prompt path)", () => {
    expect(isWorkflowCommandText("  /compare", COMMANDS)).toBe(true);
  });

  it("rejects unknown commands, non-slash text, and prefix collisions", () => {
    expect(isWorkflowCommandText("/help", COMMANDS)).toBe(false);
    expect(isWorkflowCommandText("/comparex", COMMANDS)).toBe(false);
    expect(isWorkflowCommandText("compare the files", COMMANDS)).toBe(false);
    expect(isWorkflowCommandText("run /compare for me", COMMANDS)).toBe(false);
    expect(isWorkflowCommandText("/", COMMANDS)).toBe(false);
    expect(isWorkflowCommandText("", COMMANDS)).toBe(false);
  });

  it("recognizes EVERY built-in workflow command (the real leak set)", () => {
    // The reported bug: /compare fired an autopilot review of a report-only
    // command. Prove the gate recognizes every shipped PROMPT_COMMAND (and its
    // aliases) so none of them can leak into a review.
    for (const cmd of PROMPT_COMMANDS) {
      expect(isWorkflowCommandText(`/${cmd.name}`, PROMPT_COMMANDS)).toBe(true);
      expect(isWorkflowCommandText(`/${cmd.name} with args`, PROMPT_COMMANDS)).toBe(true);
      for (const alias of cmd.aliases) {
        expect(isWorkflowCommandText(`/${alias}`, PROMPT_COMMANDS)).toBe(true);
      }
    }
  });
});

describe("matchExpandedCommand", () => {
  it("matches an exact template body", () => {
    const m = matchExpandedCommand("Compare the code you just created…", COMMANDS);
    expect(m?.command.name).toBe("compare");
    expect(m?.args).toBeNull();
  });

  it("matches template + user-instructions suffix and extracts the args", () => {
    const text = `Audit the project…${USER_INSTRUCTIONS_HEADER}only the auth module`;
    const m = matchExpandedCommand(text, COMMANDS);
    expect(m?.command.name).toBe("bullet-proof");
    expect(m?.args).toBe("only the auth module");
  });

  it("uses the exact separator AgentSession.prompt() inserts", () => {
    // Lockstep guard: if agent-session.ts ever changes its expansion format,
    // this literal must change with it or digest labeling silently breaks.
    expect(USER_INSTRUCTIONS_HEADER).toBe("\n\n## User Instructions\n\n");
  });

  it("returns null for ordinary user text and near-misses", () => {
    expect(matchExpandedCommand("compare my code to the repo", COMMANDS)).toBeNull();
    // Template body with arbitrary extra text but no separator is NOT an expansion.
    expect(
      matchExpandedCommand("Compare the code you just created… and also do X", COMMANDS),
    ).toBeNull();
    expect(matchExpandedCommand("", COMMANDS)).toBeNull();
  });

  it("matches every real built-in template round-tripped through expansion", () => {
    for (const cmd of PROMPT_COMMANDS) {
      // Mirrors AgentSession.prompt(): bare command → template verbatim.
      expect(matchExpandedCommand(cmd.prompt, PROMPT_COMMANDS)?.command.name).toBe(cmd.name);
      // Command with args → template + header + args.
      const withArgs = `${cmd.prompt}${USER_INSTRUCTIONS_HEADER}focus on src/`;
      const m = matchExpandedCommand(withArgs, PROMPT_COMMANDS);
      expect(m?.command.name).toBe(cmd.name);
      expect(m?.args).toBe("focus on src/");
    }
  });
});

describe("countAssistantMessages", () => {
  it("counts only assistant-role messages", () => {
    expect(
      countAssistantMessages([
        { role: "system" },
        { role: "user" },
        { role: "assistant" },
        { role: "tool" },
        { role: "assistant" },
      ]),
    ).toBe(2);
    expect(countAssistantMessages([])).toBe(0);
  });
});

describe("shouldStartAutopilotCycle", () => {
  const reviewable = {
    enabled: true,
    cancelled: false,
    planMode: false,
    workflowCommand: false,
    assistantMessagesAdded: 1,
  };

  it("starts for a normal reviewable turn", () => {
    expect(shouldStartAutopilotCycle(reviewable)).toEqual({ start: true });
  });

  it("skips when autopilot is off", () => {
    expect(shouldStartAutopilotCycle({ ...reviewable, enabled: false })).toEqual({
      start: false,
      reason: "disabled",
    });
  });

  it("skips when the turn was cancelled", () => {
    expect(shouldStartAutopilotCycle({ ...reviewable, cancelled: true })).toEqual({
      start: false,
      reason: "cancelled",
    });
  });

  it("skips when the turn ended in plan mode (pending Accept/Reject modal)", () => {
    expect(shouldStartAutopilotCycle({ ...reviewable, planMode: true })).toEqual({
      start: false,
      reason: "plan-mode",
    });
  });

  it("skips workflow-command turns (/compare — the reported bug)", () => {
    expect(shouldStartAutopilotCycle({ ...reviewable, workflowCommand: true })).toEqual({
      start: false,
      reason: "workflow-command",
    });
  });

  it("skips turns that added no assistant output (/help, unknown /foo, failed runs)", () => {
    expect(shouldStartAutopilotCycle({ ...reviewable, assistantMessagesAdded: 0 })).toEqual({
      start: false,
      reason: "no-assistant-output",
    });
    // A run that somehow REMOVED messages (defensive) also never reviews.
    expect(shouldStartAutopilotCycle({ ...reviewable, assistantMessagesAdded: -1 })).toEqual({
      start: false,
      reason: "no-assistant-output",
    });
  });

  it("resolves multiple skip conditions in fixed priority order", () => {
    // disabled beats everything; plan-mode beats workflow-command beats no-output.
    expect(
      shouldStartAutopilotCycle({
        enabled: false,
        cancelled: true,
        planMode: true,
        workflowCommand: true,
        assistantMessagesAdded: 0,
      }),
    ).toEqual({ start: false, reason: "disabled" });
    expect(
      shouldStartAutopilotCycle({
        ...reviewable,
        planMode: true,
        workflowCommand: true,
        assistantMessagesAdded: 0,
      }),
    ).toEqual({ start: false, reason: "plan-mode" });
    expect(
      shouldStartAutopilotCycle({
        ...reviewable,
        workflowCommand: true,
        assistantMessagesAdded: 0,
      }),
    ).toEqual({ start: false, reason: "workflow-command" });
  });
});
