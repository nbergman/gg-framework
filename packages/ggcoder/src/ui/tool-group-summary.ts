export interface ToolGroupSummaryTool {
  name: string;
  args: Record<string, unknown>;
  status: "running" | "done";
  isError?: boolean;
  result?: string;
}

export interface SummarySegment {
  text: string;
  bold: boolean;
  /** If set, use this color instead of default text color. */
  color?: string;
}

type GroupRenderer = (
  tools: readonly ToolGroupSummaryTool[],
  allDone: boolean,
) => SummarySegment[][];

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function renderGrepGroup(
  tools: readonly ToolGroupSummaryTool[],
  allDone: boolean,
): SummarySegment[][] {
  const count = tools.length;
  return [
    allDone
      ? [
          { text: "Searched", bold: true },
          { text: " for ", bold: false },
          { text: String(count), bold: true },
          { text: ` ${plural(count, "pattern")}`, bold: false },
        ]
      : [
          { text: "Searching", bold: true },
          { text: " for ", bold: false },
          { text: String(count), bold: true },
          { text: ` ${plural(count, "pattern")}`, bold: false },
        ],
  ];
}

function renderReadGroup(
  tools: readonly ToolGroupSummaryTool[],
  allDone: boolean,
): SummarySegment[][] {
  const count = tools.filter((tool) => String(tool.args.file_path ?? "").length > 0).length;
  const fileCount = count || tools.length;
  return [
    allDone
      ? [
          { text: "Read", bold: true },
          { text: " ", bold: false },
          { text: String(fileCount), bold: true },
          { text: ` ${plural(fileCount, "file")}`, bold: false },
        ]
      : [
          { text: "Reading", bold: true },
          { text: " ", bold: false },
          { text: String(fileCount), bold: true },
          { text: ` ${plural(fileCount, "file")}`, bold: false },
        ],
  ];
}

function renderFindGroup(
  tools: readonly ToolGroupSummaryTool[],
  allDone: boolean,
): SummarySegment[][] {
  const count = tools.length;
  return [
    allDone
      ? [
          { text: "Found", bold: true },
          { text: " files for ", bold: false },
          { text: String(count), bold: true },
          { text: ` ${plural(count, "pattern")}`, bold: false },
        ]
      : [
          { text: "Finding", bold: true },
          { text: " files for ", bold: false },
          { text: String(count), bold: true },
          { text: ` ${plural(count, "pattern")}`, bold: false },
        ],
  ];
}

function renderLsGroup(
  tools: readonly ToolGroupSummaryTool[],
  allDone: boolean,
): SummarySegment[][] {
  const count = tools.length;
  return [
    allDone
      ? [
          { text: "Listed", bold: true },
          { text: " ", bold: false },
          { text: String(count), bold: true },
          { text: ` ${plural(count, "directory", "directories")}`, bold: false },
        ]
      : [
          { text: "Listing", bold: true },
          { text: " ", bold: false },
          { text: String(count), bold: true },
          { text: ` ${plural(count, "directory", "directories")}`, bold: false },
        ],
  ];
}

/** Registry of group renderers by tool name. Add entries to support new grouped summaries. */
const GROUP_RENDERERS: Record<string, GroupRenderer> = {
  grep: renderGrepGroup,
  read: renderReadGroup,
  find: renderFindGroup,
  ls: renderLsGroup,
};

export function buildToolGroupSummary(
  tools: readonly ToolGroupSummaryTool[],
  allDone: boolean,
): SummarySegment[] {
  const byName: Record<string, ToolGroupSummaryTool[]> = {};
  for (const tool of tools) {
    (byName[tool.name] ??= []).push(tool);
  }

  const parts: SummarySegment[][] = [];
  for (const [name, toolsOfType] of Object.entries(byName)) {
    const renderer = GROUP_RENDERERS[name];
    if (renderer) {
      parts.push(...renderer(toolsOfType, allDone));
    }
  }

  if (parts.length === 0) {
    return [{ text: allDone ? "Done" : "Working…", bold: false }];
  }

  const firstPart = parts[0];
  if (firstPart && firstPart.length > 0) {
    const firstSegment = firstPart[0];
    if (firstSegment) {
      firstPart[0] = {
        ...firstSegment,
        text: firstSegment.text[0]?.toUpperCase() + firstSegment.text.slice(1),
      };
    }
  }

  const segments: SummarySegment[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (i > 0) segments.push({ text: ", ", bold: false });
    segments.push(...part);
  }

  return segments;
}

export function segmentsToPlainText(segments: readonly SummarySegment[]): string {
  return segments.map((segment) => segment.text).join("");
}
