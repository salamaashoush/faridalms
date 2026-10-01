import type { GapsBlock } from "./learning";

export type GapSegment = GapsBlock["segments"][number];

/**
 * A passage with its blanks in square brackets, as a teacher types it:
 * [answer/another] for a blank typed into, any of them accepted, and
 * [right|wrong|wrong] for one chosen from a list, the first choice right.
 * Blanks keep the ids they had by position, so answers already given still
 * line up after an edit.
 */
export function parseGaps(
  source: string,
  ids: readonly string[] = [],
): GapSegment[] {
  const segments: GapSegment[] = [];
  let at = 0;
  let gap = 0;
  for (const match of source.matchAll(/\[([^[\]]*)\]/g)) {
    if (match.index > at)
      segments.push({ type: "text", text: source.slice(at, match.index) });
    const inner = match[1] ?? "";
    const listed = inner.includes("|");
    const parts = inner
      .split(listed ? "|" : "/")
      .map((part) => part.trim())
      .filter(Boolean);
    segments.push({
      type: "gap",
      id: ids[gap] ?? crypto.randomUUID(),
      answers: listed ? parts.slice(0, 1) : parts,
      options: listed ? [...new Set(parts)] : [],
    });
    gap++;
    at = match.index + match[0].length;
  }
  if (at < source.length)
    segments.push({ type: "text", text: source.slice(at) });
  return segments;
}

export function gapsSource(segments: readonly GapSegment[]): string {
  return segments
    .map((segment) => {
      if (segment.type === "text") return segment.text;
      if (segment.options.length === 0) return `[${segment.answers.join("/")}]`;
      const right = segment.answers[0] ?? "";
      return `[${[right, ...segment.options.filter((option) => option !== right)].join("|")}]`;
    })
    .join("");
}
