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
