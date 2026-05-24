import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildGoalReferenceContext,
  referencesRequiringAcknowledgement,
} from "./goal-references.js";
import type { ImageAttachment } from "../utils/image.js";

let tmpProject: string;

beforeEach(async () => {
  tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), "goal-references-test-"));
});

afterEach(async () => {
  await fs.rm(tmpProject, { recursive: true, force: true });
});

describe("goal reference context", () => {
  it("extracts URLs, persists attachments, and formats mandatory prompt context", async () => {
    const attachment: ImageAttachment = {
      kind: "text",
      fileName: "notes.md",
      filePath: path.join(tmpProject, "notes.md"),
      mediaType: "text/markdown",
      data: "Match this documented behavior.",
    };

    const context = await buildGoalReferenceContext({
      cwd: tmpProject,
      originalGoalPrompt:
        "Build this like https://github.com/acme/reference-ui and explain https://example.com/docs.",
      attachments: [attachment],
    });

    const kinds = context.references.map((reference) => reference.kind);
    expect(kinds).toEqual(expect.arrayContaining(["prompt", "repo", "url", "text"]));
    expect(context.promptSection).toContain("## Goal References (MANDATORY)");
    expect(context.promptSection).toContain("https://github.com/acme/reference-ui");
    expect(context.promptSection).toContain("Match this documented behavior.");
    const textReference = context.references.find((reference) => reference.kind === "text");
    expect(textReference?.path).toMatch(/^\.gg\/goal-references\/text-/);
    expect(await fs.readFile(path.join(tmpProject, textReference?.path ?? ""), "utf-8")).toBe(
      "Match this documented behavior.",
    );
    expect(
      referencesRequiringAcknowledgement(context.references).map((reference) => reference.kind),
    ).toEqual(expect.arrayContaining(["repo", "url", "text"]));
    expect(
      referencesRequiringAcknowledgement(context.references).map((reference) => reference.kind),
    ).not.toContain("prompt");
  });
});
