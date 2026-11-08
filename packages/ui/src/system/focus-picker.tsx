import type { KeyboardEvent, PointerEvent } from "react";

/** Where a picture's subject sits, in percent of its width and height from its top left. */
export interface FocusPoint {
  x: number;
  y: number;
}

export interface FocusPickerProps {
  src: string;
  /** Names the point, and how to move it, for keyboard and screen reader users. */
  label: string;
  focus: FocusPoint;
  onChange: (focus: FocusPoint) => void;
}

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const percent = (value: number) =>
  Math.round(Math.min(100, Math.max(0, value)));

/**
 * A picture with a mark on its subject, which every crop and shape of it
 * keeps in view. A press or a drag puts the mark there; the arrow keys on
 * the mark move it, in finer steps with Shift held. The picture's own left
 * and top are the mark's, whatever the page's direction, since the point
 * is on the picture's pixels.
 */
export function FocusPicker({ src, label, focus, onChange }: FocusPickerProps) {
  const place = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    onChange({
      x: percent(((event.clientX - box.left) / box.width) * 100),
      y: percent(((event.clientY - box.top) / box.height) * 100),
    });
  };
  const nudge = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = NUDGE[event.key];
    if (!step) return;
    event.preventDefault();
    const by = event.shiftKey ? 1 : 5;
    onChange({
      x: percent(focus.x + step[0] * by),
      y: percent(focus.y + step[1] * by),
    });
  };
  return (
    <div
      dir="ltr"
      className="relative mx-auto w-fit max-w-full cursor-crosshair touch-none overflow-hidden rounded-md border select-none"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        place(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          place(event);
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="block max-h-[50vh] w-auto max-w-full"
      />
      <button
        type="button"
        aria-label={label}
        onKeyDown={nudge}
        className="absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary/40 shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_0_0_9999px_rgb(0_0_0/0.15)] outline-none focus-visible:ring-3 focus-visible:ring-ring/80"
        style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
      />
    </div>
  );
}
