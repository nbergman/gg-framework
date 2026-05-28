export interface AssistantStreamSplit {
  flushedText: string;
  remainingText: string;
}

export function splitAssistantStreamingText(text: string): AssistantStreamSplit {
  return { flushedText: "", remainingText: text };
}
