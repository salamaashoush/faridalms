import type { ReactNode } from "react";

import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "../cn";

export interface PreviewFit {
  /** The scale the content is drawn at. */
  scale: number;
  /** Where the drawn content starts across and down the box, in pixels. */
  x: number;
  y: number;
}

export interface PreviewFitInput {
  /** The box's width and height. */
  box: { width: number; height: number };
  /** The content's width and height as laid out, before scaling. */
  content: { width: number; height: number };
  /** How far below the width's own scale a tall content may shrink, as a share of it. */
  minShrink: number;
}

/**
 * The scale that fits content into a box: the box's width first, then
 * smaller until its height fits too, but never below `minShrink` of the
 * width's scale, so a very long content keeps readable words and is cut
 * at the bottom instead. Content shorter than the box sits in its middle.
 */
export function previewFit({
  box,
  content,
  minShrink,
}: PreviewFitInput): PreviewFit {
  if (content.width <= 0 || box.width <= 0) return { scale: 0, x: 0, y: 0 };
  const across = Math.min(1, box.width / content.width);
  const down = content.height > 0 ? box.height / content.height : across;
  const scale = Math.max(Math.min(across, down), across * minShrink);
  return {
    scale,
    x: (box.width - content.width * scale) / 2,
    y: Math.max(0, (box.height - content.height * scale) / 2),
  };
}

export interface ScaledPreviewProps {
  /** The width the content is laid out at, such as a desktop page's. */
  width: number;
  /** The box's height in pixels. */
  height: number;
  /** See `previewFit`; 0.6 keeps a tall content's words legible. */
  minShrink?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Content laid out at a real width and drawn scaled down into a box of a
 * fixed height, whole where it fits. It is a picture for choosing: it
 * cannot be focused or clicked into, and screen readers skip it.
 */
export function ScaledPreview({
  width,
  height,
  minShrink = 0.6,
  className,
  children,
}: ScaledPreviewProps) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState({ box: 0, content: 0 });
  useLayoutEffect(() => {
    const outer = box.current;
    const inner = content.current;
    if (!outer || !inner) return undefined;
    const measure = () =>
      setMeasured({ box: outer.clientWidth, content: inner.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);
  const fit = previewFit({
    box: { width: measured.box, height },
    content: { width, height: measured.content },
    minShrink,
  });
  return (
    <div
      ref={box}
      aria-hidden
      inert
      className={cn("pointer-events-none relative overflow-hidden", className)}
      style={{ height }}
    >
      <div
        ref={content}
        className="absolute top-0"
        // Centred by measurement, which reads the same in either direction.
        style={{
          left: fit.x,
          width,
          transform: `translateY(${fit.y}px) scale(${fit.scale})`,
          transformOrigin: "0 0",
          visibility: fit.scale ? undefined : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
