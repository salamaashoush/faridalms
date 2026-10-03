import { westernDigits } from "./answers";

/** A named part of a recording, from the second it starts. */
export interface Chapter {
  at: number;
  title: string;
}

export const MAX_CHAPTERS = 50;
export const MAX_CHAPTER_TITLE = 100;
/** As long as the chapter lines a teacher writes may run. */
export const MAX_CHAPTER_TEXT = 4000;

const LINE = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\s+(.+)$/;

/**
 * A recording's chapters from the lines a teacher writes, as video sites
 * take them: a time, then the chapter's name, one a line ("1:30 Loops").
 * Lines that are not a chapter are left out, the chapters run in time
 * order, and a second time named twice keeps its first name.
 */
export function parseChapters(text: string): Chapter[] {
  const found = new Map<number, string>();
  for (const line of westernDigits(text).split("\n")) {
    const match = LINE.exec(line.trim());
    if (!match) continue;
    const [, hours = "0", minutes = "0", seconds = "0", name = ""] = match;
    if (
      Number(seconds) > 59 ||
      (match[1] !== undefined && Number(minutes) > 59)
    )
      continue;
    const at = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
    const title = name.trim().slice(0, MAX_CHAPTER_TITLE);
    if (title && !found.has(at)) found.set(at, title);
  }
  return [...found]
    .map(([at, title]) => ({ at, title }))
    .toSorted((a, b) => a.at - b.at)
    .slice(0, MAX_CHAPTERS);
}

const stamp = (seconds: number) => {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const parts = [Math.floor((whole % 3600) / 60), whole % 60].map((part) =>
    String(part).padStart(2, "0"),
  );
  return `${String(hours).padStart(2, "0")}:${parts.join(":")}.000`;
};

/**
 * The chapters as a WebVTT chapters track, each running to the next and the
 * last to the end of the recording, however long it turns out to be.
 */
export function chaptersVtt(chapters: readonly Chapter[]): string {
  const cues = chapters.map((chapter, index) => {
    const end = chapters[index + 1]?.at ?? 99 * 3600;
    return `${stamp(chapter.at)} --> ${stamp(end)}\n${chapter.title.replaceAll("-->", "->")}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
