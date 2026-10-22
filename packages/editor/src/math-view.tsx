import type { Digits } from "@faridalms/domain/people";

import { arabicMathML } from "@faridalms/domain/arabic-math";
import { useMemo } from "react";
import temml from "temml";

import { cx } from "./ui";

/**
 * Mathematics as MathML. Temml escapes every character it is given and,
 * with trust left off, draws no link, class or style from it, so the
 * markup holds the formula and nothing else a writer typed. A formula in
 * Arabic notation is drawn with Arabic letters, in the school's digits.
 */
export function MathMarkup({
  latex,
  display,
  rtl,
  digits,
}: {
  latex: string;
  display: boolean;
  rtl: boolean;
  digits: Digits;
}) {
  const markup = useMemo(() => {
    const drawn = temml.renderToString(latex, {
      displayMode: display,
      annotate: true,
      throwOnError: false,
    });
    return rtl ? arabicMathML(drawn, digits) : drawn;
  }, [latex, display, rtl, digits]);
  return (
    <span
      className={cx("fe-math", display && "fe-math-display")}
      dir={rtl ? "rtl" : undefined}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
