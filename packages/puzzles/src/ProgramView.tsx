import type { PuzzleStyle } from "./level";
import type { Program } from "./program";
import type { PuzzleStrings } from "./strings";

import { ArrowStrip } from "./ArrowStrip";
import { wordsOf } from "./text";

/**
 * A program to read, with nothing to run it on: a row of arrows as its
 * arrows, a program of blocks as the words on its blocks, each inside
 * another set further in.
 */
export function ProgramView({
  program,
  style,
  strings,
}: {
  program: Program;
  style: PuzzleStyle;
  strings: PuzzleStrings;
}) {
  if (style === "arrows")
    return (
      <ArrowStrip program={program} limit={null} at={null} strings={strings} />
    );
  return (
    <ol data-puzzle-program="" className="grid justify-items-start gap-1">
      {wordsOf(program, strings.blocks).map((line, index) => (
        <li
          // A line is nothing but its words and its place in the program.
          key={`${index}:${line.text}`}
          style={{ paddingInlineStart: `${line.depth * 1.5}rem` }}
        >
          <span className="inline-flex rounded-md border bg-muted/40 px-2 py-1 text-sm leading-5">
            {line.text}
          </span>
        </li>
      ))}
    </ol>
  );
}
