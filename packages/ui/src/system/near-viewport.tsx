import type { CSSProperties, ReactNode } from "react";

import { useEffect, useRef, useState } from "react";

import { cn } from "../cn";

export interface NearViewportProps {
  /**
   * How far outside the visible area its content is already drawn, as a
   * CSS margin; beyond it the content is let go again.
   */
  margin?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** The nearest ancestor that scrolls, whose edges hide the box before the screen's do. */
function scroller(element: HTMLElement): HTMLElement | null {
  for (let at = element.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (overflowY === "auto" || overflowY === "scroll") return at;
  }
  return null;
}

/**
 * A box whose content is drawn only while the box is on screen or near
 * it, for costly pictures in long lists such as whole pages drawn small.
 * Nothing is drawn on the server or before the browser says where the box
 * is, so a page full of them hydrates as quickly as one with none; the
 * box keeps its own size meanwhile, which its `className` or `style` give.
 */
export function NearViewport({
  margin = "400px",
  className,
  style,
  children,
}: NearViewportProps) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = box.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry) setNear(entry.isIntersecting);
      },
      { root: scroller(element), rootMargin: margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [margin]);
  return (
    <div ref={box} className={cn("min-w-0", className)} style={style}>
      {near ? children : null}
    </div>
  );
}
