import { describe, expect, it } from "vitest";
import { splitAssistantStreamingText } from "./assistant-stream-split.js";

describe("splitAssistantStreamingText", () => {
  it("keeps assistant text intact so live and history render exactly the same", () => {
    const cases = [
      "Dr. Jones keeps a notebook full of odd theories and coffee stains. The next sentence stays with it.",
      "1. Dr. Jones keeps a spare notebook.\n2. Dr. Jones believes every mystery deserves coffee first.",
      "- Dr. Jones once labeled an entire filing cabinet important.\n- Dr. Jones explains things with metaphors.",
      "Paragraph one has a line break.\n\nParagraph two must preserve that exact break.\n\nParagraph three too.",
      "Here is code:\n\n```ts\nconst one = 1;\nconst two = 2;\n```\n\nDone.",
    ];

    for (const text of cases) {
      expect(splitAssistantStreamingText(text)).toEqual({ flushedText: "", remainingText: text });
    }
  });
});
