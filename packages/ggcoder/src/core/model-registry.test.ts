import { describe, expect, it } from "vitest";
import {
  getContextWindow,
  getDefaultModel,
  getModelsForProvider,
  usesOpenAICodexTransport,
} from "./model-registry.js";

describe("model registry context windows", () => {
  it("uses the public API context window for OpenAI API-key requests", () => {
    expect(getContextWindow("gpt-5.5", { provider: "openai" })).toBe(1_050_000);
    expect(getContextWindow("gpt-5.4", { provider: "openai" })).toBe(1_050_000);
  });

  it("uses the Codex product context window for OpenAI OAuth requests", () => {
    const options = { provider: "openai" as const, accountId: "acct_123" };

    expect(usesOpenAICodexTransport(options)).toBe(true);
    expect(getContextWindow("gpt-5.5", options)).toBe(272_000);
    expect(getContextWindow("gpt-5.4", options)).toBe(272_000);
  });

  it("keeps non-OpenAI providers on their model context windows", () => {
    expect(usesOpenAICodexTransport({ provider: "anthropic", accountId: "acct_123" })).toBe(false);
    expect(
      getContextWindow("claude-sonnet-4-6", { provider: "anthropic", accountId: "acct_123" }),
    ).toBe(1_000_000);
  });

  it("registers a Code Assist-supported Gemini default", () => {
    expect(getDefaultModel("gemini")).toMatchObject({
      id: "gemini-3.1-flash-lite-preview",
      name: "Gemini 3.1 Flash Lite Preview",
      provider: "gemini",
    });
    expect(getModelsForProvider("gemini").map((model) => model.id)).toEqual([
      "gemini-3.1-flash-lite-preview",
      "gemini-3.5-flash",
    ]);
    expect(getContextWindow("gemini-3.1-flash-lite-preview", { provider: "gemini" })).toBe(
      1_048_576,
    );
    expect(getContextWindow("gemini-3.5-flash", { provider: "gemini" })).toBe(1_048_576);
  });
});
