const span = (from: number, to: number) =>
  `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`;

/** Arabic letters, which join to their neighbours within a word. */
const ARABIC_LETTER = new RegExp(
  `[${span(0x0620, 0x064a)}${span(0x066e, 0x06d3)}${span(0x06fa, 0x06fc)}]`,
  "u",
);
const JOINER = String.fromCodePoint(0x200d);

type Segment = { type: "text"; text: string } | { type: "gap" };

/**
 * A passage whose gaps sit inside Arabic words, with a zero-width joiner on
 * the text side of each gap, so the letters beside it keep the joined forms
 * they take in the whole word rather than breaking into isolated ones.
 */
export function joinedAroundGaps<T extends Segment>(
  segments: readonly T[],
): T[] {
  return segments.map((segment, index) => {
    if (segment.type !== "text" || !("text" in segment)) return segment;
    let text = segment.text;
    const after = segments[index + 1];
    const before = segments[index - 1];
    if (after?.type === "gap" && ARABIC_LETTER.test(text.at(-1) ?? ""))
      text = `${text}${JOINER}`;
    if (before?.type === "gap" && ARABIC_LETTER.test(text.at(0) ?? ""))
      text = `${JOINER}${text}`;
    return text === segment.text ? segment : { ...segment, text };
  });
}

/**
 * Vowel marks: Arabic harakat, Quranic annotation signs and Hebrew points.
 * Early readers need them and older ones learn to read without them, so a
 * lesson can show its words either way.
 */
const VOWEL_MARKS = new RegExp(
  `[${span(0x064b, 0x065f)}${String.fromCodePoint(0x0670)}${span(0x06d6, 0x06ed)}${span(0x0591, 0x05bd)}${String.fromCodePoint(0x05bf, 0x05c1, 0x05c2, 0x05c4, 0x05c5, 0x05c7)}]`,
  "gu",
);

export function withoutVowelMarks(text: string): string {
  return text.replace(VOWEL_MARKS, "");
}

/** Any value read for display, with vowel marks taken out of every string. */
export function allWithoutVowelMarks<T>(value: T): T {
  if (typeof value === "string") return withoutVowelMarks(value) as T;
  if (Array.isArray(value))
    return value.map((item: unknown) => allWithoutVowelMarks(item)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        allWithoutVowelMarks(item),
      ]),
    ) as T;
  return value;
}

const ARABIC_LETTERS = new RegExp(`[${span(0x0621, 0x064a)}]`, "gu");
const HARAKAT = new RegExp(`[${span(0x064b, 0x0652)}]`, "gu");

/**
 * Whether a browser voice may read a text to a child. Arabic written without
 * its short vowels leaves the voice guessing them, and it misreads about one
 * word in ten, so only vowelled Arabic is read without a recording.
 */
export function voiceCanRead(text: string): boolean {
  const letters = text.match(ARABIC_LETTERS)?.length ?? 0;
  return letters === 0 || (text.match(HARAKAT)?.length ?? 0) * 2 >= letters;
}
