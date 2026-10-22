import type { TextRun } from "@faridalms/domain/content";
import type { MathLanguage } from "@faridalms/domain/math-speech";
import type { Digits } from "@faridalms/domain/people";

import { mathRuns } from "@faridalms/domain/content";
import {
  mathTextLanguage,
  spokenMathText,
} from "@faridalms/domain/math-speech";
import { lazy, Suspense, useContext } from "react";

import { MathDigits } from "./math-digits";
import { cx } from "./ui";

// Temml joins a page's bundle only where there is mathematics to draw.
const MathMarkup = lazy(() =>
  import("./math-view").then((module) => ({ default: module.MathMarkup })),
);

/** One formula, drawn once its renderer has loaded and shown as LaTeX until then. */
export function MathText({
  latex,
  display = false,
  rtl = false,
  digits,
}: {
  latex: string;
  display?: boolean;
  rtl?: boolean;
  digits?: Digits;
}) {
  const school = useContext(MathDigits);
  return (
    <Suspense
      fallback={
        <span className={cx("fe-math", display && "fe-math-display")}>
          {latex}
        </span>
      }
    >
      <MathMarkup
        latex={latex}
        display={display}
        rtl={rtl}
        digits={digits ?? school}
      />
    </Suspense>
  );
}

/** Plain text with the \(…\) and \[…\] mathematics written in it drawn as such. */
export function TextWithMath({ text }: { text: string }) {
  const runs: TextRun[] = mathRuns(text);
  if (runs.every((run) => "text" in run)) return text;
  let at = 0;
  return runs.map((run) => {
    const key = `${at}`;
    at += "latex" in run ? run.latex.length + 4 : run.text.length;
    return "latex" in run ? (
      <MathText key={key} latex={run.latex} display={run.block} rtl={run.rtl} />
    ) : (
      <span key={key}>{run.text}</span>
    );
  });
}

/**
 * The same text for a label or a voice: each formula said in words, in the
 * language of the words around it, else in `fallback`.
 */
export const textOfMath = (text: string, fallback: MathLanguage) =>
  spokenMathText(text, mathTextLanguage(text, fallback));
