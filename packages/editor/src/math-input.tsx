import type { ComponentProps } from "react";

import { lazy, Suspense } from "react";

// MathLive joins the page only where a formula is written.
const MathField = lazy(() => import("./plugins/math-field"));

/** A field to write a formula in, as a student answers or a teacher writes. */
export function MathInput(props: ComponentProps<typeof MathField>) {
  return (
    <Suspense fallback={<div className="fe-math-field h-10 min-w-0 flex-1" />}>
      <MathField {...props} />
    </Suspense>
  );
}
