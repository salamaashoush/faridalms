import { useEffect, useRef } from "react";

const calm = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A small hop for a right answer; nothing for children who asked for stillness. */
export function hop(element: HTMLElement | null | undefined) {
  if (!element || calm()) return;
  element.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.06)" },
      { transform: "scale(1)" },
    ],
    { duration: 280, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  );
}

/** A gentle shake for "not yet", short enough not to read as a scolding. */
export function shake(element: HTMLElement | null | undefined) {
  if (!element || calm()) return;
  element.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 320, easing: "ease-out" },
  );
}

const SPARKS = 14;
const COLOURS = ["#f5b700", "#3f8f5b", "#2f7fbf", "#cf4b45", "#8e5bd0"];

/**
 * A short burst of coloured dots from the middle of what it sits in, shown
 * once at the end of a lesson rather than after every answer.
 */
export function Burst() {
  const holder = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (calm()) return;
    const sparks = holder.current?.querySelectorAll<HTMLElement>("span") ?? [];
    sparks.forEach((spark, index) => {
      const angle = (index / SPARKS) * Math.PI * 2;
      const reach = 90 + (index % 3) * 30;
      spark.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          {
            transform: `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach}px) scale(0.4)`,
            opacity: 0,
          },
        ],
        {
          duration: 900,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        },
      );
    });
  }, []);
  return (
    <span
      ref={holder}
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      {Array.from({ length: SPARKS }, (_, index) => (
        <span
          key={index}
          className="absolute size-3 rounded-full opacity-0"
          style={{ backgroundColor: COLOURS[index % COLOURS.length] }}
        />
      ))}
    </span>
  );
}
