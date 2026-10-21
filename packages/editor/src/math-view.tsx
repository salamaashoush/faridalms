import { useMemo } from "react";
import temml from "temml";

import { cx } from "./ui";

/**
 * Mathematics as MathML. Temml escapes every character it is given and,
 * with trust left off, draws no link, class or style from it, so the
 * markup holds the formula and nothing else a writer typed.
 */
export function MathMarkup({
  latex,
  display,
  rtl,
}: {
  latex: string;
  display: boolean;
  rtl: boolean;
}) {
  const markup = useMemo(
    () =>
      temml.renderToString(latex, {
        displayMode: display,
        annotate: true,
        throwOnError: false,
      }),
    [latex, display],
  );
  return (
    <span
      className={cx("fe-math", display && "fe-math-display")}
      dir={rtl ? "rtl" : undefined}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
