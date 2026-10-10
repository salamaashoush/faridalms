import type { PointerEvent as ReactPointerEvent } from "react";

import { useRef } from "react";
import { flushSync } from "react-dom";

/** A row of a list as it lay when a drag began: its top down the page, and its height. */
export interface Row {
  top: number;
  height: number;
}

/** How far a press travels before it is a drag. */
const START = 4;
/** How close to the top or bottom of the screen a held row starts to scroll it. */
const EDGE = 64;
/** The most a held row scrolls the screen in one frame. */
const SCROLL = 14;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const SHIFT_MS = 160;

const middle = (row: Row) => row.top + row.height / 2;

/**
 * Where a held row would land, moved `delta` from where it began: past
 * every row whose middle its leading edge has crossed. Its edge and not its
 * own middle, since a row held against the end of the list has no further
 * to go and must still be able to land there.
 */
export function landingIndex(
  rows: readonly Row[],
  from: number,
  delta: number,
): number {
  const own = rows[from];
  if (!own) return from;
  const top = own.top + delta;
  const bottom = top + own.height;
  let to = from;
  for (let index = from + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row && bottom > middle(row)) to = index;
  }
  for (let index = from - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row && top < middle(row)) to = index;
  }
  return to;
}

/**
 * How far the held row sits from where it began once it has landed: the
 * heights of the rows it passed, with the gaps between them.
 */
export function landingOffset(
  rows: readonly Row[],
  gap: number,
  from: number,
  to: number,
): number {
  let offset = 0;
  for (let index = from + 1; index <= to; index += 1)
    offset += (rows[index]?.height ?? 0) + gap;
  for (let index = to; index < from; index += 1)
    offset -= (rows[index]?.height ?? 0) + gap;
  return offset;
}

interface Drag {
  from: number;
  to: number;
  /** Where the press began and the finger is now, down the page. */
  startY: number;
  clientY: number;
  rows: Row[];
  elements: HTMLElement[];
  gap: number;
  lifted: boolean;
  frame: number;
}

const still = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The held row follows the finger; the rows it passes step aside. */
function step(drag: Drag) {
  drag.frame = 0;
  const held = drag.elements[drag.from];
  const first = drag.rows[0];
  const last = drag.rows.at(-1);
  const own = drag.rows[drag.from];
  if (!held || !first || !last || !own) return;
  // A row cannot leave its list.
  const delta = Math.max(
    first.top - own.top,
    Math.min(
      last.top + last.height - (own.top + own.height),
      drag.clientY + window.scrollY - drag.startY,
    ),
  );
  held.style.transform = `translate3d(0, ${delta}px, 0)`;
  drag.to = landingIndex(drag.rows, drag.from, delta);
  const room = own.height + drag.gap;
  drag.elements.forEach((element, index) => {
    if (index === drag.from) return;
    const aside =
      index > drag.from && index <= drag.to
        ? -room
        : index < drag.from && index >= drag.to
          ? room
          : 0;
    element.style.transform = aside ? `translate3d(0, ${aside}px, 0)` : "";
  });
  const pull =
    drag.clientY < EDGE
      ? -(EDGE - drag.clientY) / EDGE
      : drag.clientY > window.innerHeight - EDGE
        ? (drag.clientY - (window.innerHeight - EDGE)) / EDGE
        : 0;
  if (pull === 0) return;
  const before = window.scrollY;
  window.scrollBy(0, Math.max(-1, Math.min(1, pull)) * SCROLL);
  // Held at the edge, the row keeps scrolling without the finger moving.
  if (window.scrollY !== before)
    drag.frame = requestAnimationFrame(() => step(drag));
}

function lift(drag: Drag) {
  drag.lifted = true;
  drag.rows = drag.elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top + window.scrollY, height: box.height };
  });
  const [first, second] = drag.rows;
  drag.gap =
    first && second ? Math.max(0, second.top - first.top - first.height) : 0;
  drag.elements.forEach((element, index) => {
    if (index === drag.from) {
      element.setAttribute("data-dragging", "");
      Object.assign(element.style, {
        position: "relative",
        zIndex: "10",
        transition: "none",
        willChange: "transform",
      });
    } else element.style.transition = `transform ${SHIFT_MS}ms ${EASE}`;
  });
}

/** Puts every row back under the page's own layout, without easing there. */
function settle(drag: Drag) {
  for (const element of drag.elements) {
    element.removeAttribute("data-dragging");
    Object.assign(element.style, {
      transition: "none",
      transform: "",
      position: "",
      zIndex: "",
      willChange: "",
    });
  }
  requestAnimationFrame(() => {
    for (const element of drag.elements) element.style.transition = "";
  });
}

/**
 * Lets a list be put in order by dragging its rows by a handle. The held
 * row follows the finger a frame at a time, the rows it passes step aside,
 * a long list scrolls from the screen's edges, and letting go glides the
 * row into its place and tells the list its new order. Buttons that move a
 * row stay beside the handle for those who cannot drag.
 */
export function useReorder(options: {
  locked: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const elements = useRef(new Map<number, HTMLElement>());
  const held = useRef<Drag | null>(null);

  const drop = (commit: boolean) => {
    const drag = held.current;
    if (!drag) return;
    held.current = null;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    if (!drag.lifted) return;
    const row = drag.elements[drag.from];
    const finish = () => {
      if (commit && drag.to !== drag.from)
        flushSync(() => options.onMove(drag.from, drag.to));
      settle(drag);
    };
    if (!row || still()) {
      finish();
      return;
    }
    const to = commit
      ? landingOffset(drag.rows, drag.gap, drag.from, drag.to)
      : 0;
    row
      .animate(
        [
          { transform: row.style.transform || "translate3d(0, 0, 0)" },
          { transform: `translate3d(0, ${to}px, 0)` },
        ],
        { duration: SHIFT_MS, easing: EASE },
      )
      .finished.then(finish, finish);
  };

  return {
    /** Marks a row of the list, by where it stands in it. */
    row: (index: number) => (element: HTMLElement | null) => {
      if (element) elements.current.set(index, element);
      else elements.current.delete(index);
    },
    /** What makes a row's handle drag it. */
    handle: (index: number) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (options.locked || event.button !== 0 || !event.isPrimary) return;
        const count = elements.current.size;
        const list = Array.from({ length: count }, (_, at) =>
          elements.current.get(at),
        );
        if (list.some((element) => !element)) return;
        held.current = {
          from: index,
          to: index,
          startY: event.clientY + window.scrollY,
          clientY: event.clientY,
          rows: [],
          elements: list as HTMLElement[],
          gap: 0,
          lifted: false,
          frame: 0,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        const drag = held.current;
        if (!drag) return;
        drag.clientY = event.clientY;
        if (!drag.lifted) {
          if (Math.abs(event.clientY + window.scrollY - drag.startY) < START)
            return;
          lift(drag);
          if (event.pointerType === "touch" && "vibrate" in navigator)
            navigator.vibrate(8);
        }
        if (!drag.frame) drag.frame = requestAnimationFrame(() => step(drag));
      },
      onPointerUp: () => {
        const drag = held.current;
        if (drag?.lifted) {
          // The last move may still be waiting for its frame.
          if (drag.frame) cancelAnimationFrame(drag.frame);
          step(drag);
        }
        drop(true);
      },
      onPointerCancel: () => drop(false),
      onLostPointerCapture: () => drop(false),
    }),
  };
}
