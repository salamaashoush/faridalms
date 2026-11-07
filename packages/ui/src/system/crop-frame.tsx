import type { KeyboardEvent, PointerEvent } from "react";

/** A part of a picture, as shares of its width and height from its top left corner. */
export interface CropShare {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropFrameProps {
  src: string;
  /** Names the frame, and how to move it, for keyboard and screen reader users. */
  label: string;
  /** What the crop keeps. */
  frame: CropShare;
  /** Moves the crop to centre on a point, as shares of the picture. */
  onCenter: (x: number, y: number) => void;
}

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const share = (value: number) => Math.min(1, Math.max(0, value));

/**
 * A picture with the part a crop keeps drawn clear and the rest shaded.
 * Dragging, or the arrow keys on the frame, moves the crop; its shape and
 * size are the caller's. The picture's own left and top are the frame's,
 * whatever the page's direction, since a crop is of the picture's pixels.
 */
export function CropFrame({ src, label, frame, onCenter }: CropFrameProps) {
  const place = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onCenter(
      share((event.clientX - box.left) / box.width),
      share((event.clientY - box.top) / box.height),
    );
  };
  const nudge = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = NUDGE[event.key];
    if (!step) return;
    event.preventDefault();
    const by = event.shiftKey ? 0.005 : 0.02;
    onCenter(
      share(frame.x + frame.width / 2 + step[0] * by),
      share(frame.y + frame.height / 2 + step[1] * by),
    );
  };
  return (
    <div
      dir="ltr"
      className="relative mx-auto w-fit max-w-full cursor-move touch-none overflow-hidden rounded-md border select-none"
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
        className="absolute border-2 border-white shadow-[0_0_0_9999px_rgb(0_0_0/0.5)] outline-none focus-visible:ring-3 focus-visible:ring-ring/80"
        style={{
          left: `${frame.x * 100}%`,
          top: `${frame.y * 100}%`,
          width: `${frame.width * 100}%`,
          height: `${frame.height * 100}%`,
        }}
      />
    </div>
  );
}
