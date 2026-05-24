import React, { useEffect, useMemo, useState } from "react";
import { Text, Box } from "ink";
import { ToolUseLoader } from "./ToolUseLoader.js";
import type { ToolGroupItem } from "../App.js";
import { useTheme } from "../theme/theme.js";
import { buildToolGroupSummary, type SummarySegment } from "../tool-group-summary.js";

type ToolGroupTool = ToolGroupItem["tools"][number];

// ── Components ───────────────────────────────────────────

function SummaryText({ segments, color }: { segments: SummarySegment[]; color: string }) {
  return (
    <>
      {segments.map((seg, i) => (
        <Text key={i} bold={seg.bold} color={seg.color ?? color}>
          {seg.text}
        </Text>
      ))}
    </>
  );
}

interface ToolGroupExecutionProps {
  tools: ToolGroupTool[];
}

function useStaticAfter(animateUntil: number | undefined): boolean {
  const [isStatic, setIsStatic] = useState(
    () => animateUntil == null || Date.now() >= animateUntil,
  );

  useEffect(() => {
    if (animateUntil == null) {
      setIsStatic(true);
      return undefined;
    }

    const remainingMs = animateUntil - Date.now();
    if (remainingMs <= 0) {
      setIsStatic(true);
      return undefined;
    }

    setIsStatic(false);
    const timer = setTimeout(() => setIsStatic(true), remainingMs);
    return () => clearTimeout(timer);
  }, [animateUntil]);

  return isStatic;
}

export function ToolGroupExecution({ tools }: ToolGroupExecutionProps) {
  const theme = useTheme();
  const allDone = tools.every((t) => t.status === "done");
  const hasError = tools.some((t) => t.isError);
  const status = allDone ? (hasError ? "error" : "done") : "running";
  const latestAnimateUntil = Math.max(0, ...tools.map((tool) => tool.animateUntil ?? 0));
  const staticAfterDeadline = useStaticAfter(
    latestAnimateUntil > 0 ? latestAnimateUntil : undefined,
  );
  const staticDisplay = status !== "running" || staticAfterDeadline;

  const segments = useMemo(() => buildToolGroupSummary(tools, allDone), [tools, allDone]);
  const labelColor = status === "error" ? theme.toolError : theme.toolName;

  return (
    <Box marginTop={1} marginBottom={1} flexDirection="row">
      <ToolUseLoader status={status} staticDisplay={staticDisplay} />
      <Box flexGrow={1} flexShrink={1}>
        <Text wrap="wrap">
          <SummaryText segments={segments} color={labelColor} />
        </Text>
      </Box>
    </Box>
  );
}
