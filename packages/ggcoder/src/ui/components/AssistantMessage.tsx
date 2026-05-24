import React from "react";
import { Text, Box } from "ink";
import { useTheme } from "../theme/theme.js";
import { Markdown } from "./Markdown.js";
import { ThinkingBlock } from "./ThinkingBlock.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { BLACK_CIRCLE } from "../constants/figures.js";

interface AssistantMessageProps {
  text: string;
  thinking?: string;
  thinkingMs?: number;
  showThinking?: boolean;
}

// BLACK_CIRCLE + " " = 2 chars
const PREFIX_WIDTH = 2;

export const AssistantMessage = React.memo(function AssistantMessage({
  text,
  thinking,
  thinkingMs,
  showThinking = false,
}: AssistantMessageProps) {
  const theme = useTheme();
  const { columns } = useTerminalSize();
  const contentWidth = Math.max(10, columns - PREFIX_WIDTH - 1);

  // Trim because stripDoneMarkers leaves a single space when an assistant
  // turn was JUST a [DONE:N] marker — we don't want a lone "⏺" rendered
  // for that. Skip the entire block (incl. the marginTop spacer) when
  // there's nothing visible to show.
  const trimmedText = text.trim();
  const hasThinking = showThinking && !!thinking;
  if (!trimmedText && !hasThinking) return null;

  return (
    <Box flexDirection="column">
      {hasThinking && <ThinkingBlock text={thinking!} durationMs={thinkingMs} />}
      {trimmedText && (
        <Box flexDirection="row" paddingLeft={1}>
          <Box width={PREFIX_WIDTH} flexShrink={0}>
            <Text color={theme.primary}>{BLACK_CIRCLE + " "}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} width={contentWidth}>
            <Markdown compact>{trimmedText}</Markdown>
          </Box>
        </Box>
      )}
    </Box>
  );
});
