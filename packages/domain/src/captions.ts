import { textDirection } from "./content";

/** One line of captions: what is said, and when, in seconds. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

const RLM = "‏";

const pad = (part: number, size = 2) => String(part).padStart(size, "0");

function stamp(value: number): string {
  const total = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor(total / 60_000) % 60;
  const secs = Math.floor(total / 1000) % 60;
  const millis = total % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(millis, 3)}`;
}

/** Seconds from a WebVTT timestamp such as 00:01:02.500 or 01:02.500. */
function seconds(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})$/.exec(value.trim());
  if (!match) return null;
  const [, hours = "0", minutes = "0", secs = "0", millis = "0"] = match;
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(secs) +
    Number(millis) / 1000
  );
}

/**
 * Captions as a WebVTT file. A line that reads right to left starts with a
 * right-to-left mark, so a player lays it out that way even when it opens
 * with a number or a Latin word.
 */
export function vttOf(cues: readonly Cue[]): string {
  const lines = ["WEBVTT", ""];
  for (const cue of [...cues].toSorted((a, b) => a.start - b.start)) {
    const text = cue.text.trim();
    if (!text || cue.end <= cue.start) continue;
    lines.push(`${stamp(cue.start)} --> ${stamp(cue.end)}`);
    for (const line of text.split("\n"))
      lines.push(textDirection(line) === "rtl" ? `${RLM}${line}` : line);
    lines.push("");
  }
  return lines.join("\n");
}

/** The cues of a WebVTT file, without the marks added for direction. */
export function parseVtt(source: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of source.replaceAll("\r\n", "\n").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((line) => line.includes("-->"));
    if (at < 0) continue;
    const [from = "", rest = ""] = lines[at]?.split("-->") ?? [];
    const start = seconds(from);
    const end = seconds(rest.trim().split(/\s+/)[0] ?? "");
    if (start === null || end === null) continue;
    cues.push({
      start,
      end,
      text: lines
        .slice(at + 1)
        .map((line) => line.replaceAll(RLM, ""))
        .join("\n")
        .trim(),
    });
  }
  return cues;
}

/** A time as a teacher reads and types it: 1:02.5 */
export function formatCueTime(value: number): string {
  const tenths = Math.max(0, Math.round(value * 10));
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** Seconds from a time a teacher typed, 1:02.5 or 62.5; null when unreadable. */
export function parseCueTime(value: string): number | null {
  const match = /^\s*(?:(\d+):)?(\d+(?:[.,]\d+)?)\s*$/.exec(value);
  if (!match) return null;
  const [, minutes = "0", secs = "0"] = match;
  return Number(minutes) * 60 + Number(secs.replace(",", "."));
}
