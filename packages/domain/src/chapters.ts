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

/** What is said of a video's picture from a second on, for a student who cannot see it. */
export interface Description {
  at: number;
  text: string;
}

export const MAX_DESCRIPTIONS = 200;
export const MAX_DESCRIPTION = 500;
/** As long as the description lines a teacher writes may run. */
export const MAX_DESCRIPTION_TEXT = 40_000;

const LINE = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\s+(.+)$/;

/**
 * Lines a teacher writes against a recording's time, as video sites take
 * chapters: a time, then the words, one a line ("1:30 Loops"). Lines that
 * are not such a line are left out, the rest run in time order, and a time
 * written twice keeps its first words.
 */
function timedLines(text: string, most: number, longest: number) {
  const found = new Map<number, string>();
  for (const line of westernDigits(text).split("\n")) {
    const match = LINE.exec(line.trim());
    if (!match) continue;
    const [, hours = "0", minutes = "0", seconds = "0", words = ""] = match;
    if (
      Number(seconds) > 59 ||
      (match[1] !== undefined && Number(minutes) > 59)
    )
      continue;
    const at = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
    const kept = words.trim().slice(0, longest);
    if (kept && !found.has(at)) found.set(at, kept);
  }
  return [...found]
    .map(([at, kept]) => ({ at, text: kept }))
    .toSorted((a, b) => a.at - b.at)
    .slice(0, most);
}

/** A recording's chapters, a time and the chapter's name a line. */
export function parseChapters(text: string): Chapter[] {
  return timedLines(text, MAX_CHAPTERS, MAX_CHAPTER_TITLE).map(
    ({ at, text: title }) => ({ at, title }),
  );
}

/**
 * A video's audio description, a time and what the picture shows from
 * then a line, as WebVTT descriptions are timed: read out with the video
 * paused, so nothing it says is talked over.
 */
export function parseDescriptions(text: string): Description[] {
  return timedLines(text, MAX_DESCRIPTIONS, MAX_DESCRIPTION);
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
