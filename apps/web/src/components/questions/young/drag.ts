import type { PointerEvent as ReactPointerEvent } from "react";

import { useRef } from "react";
import { flushSync } from "react-dom";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Place {
  id: string;
  box: Box;
}

/** How far a press travels before it is a drag and not a tap. */
const START = 8;
/** The share of a card that must lie over a place for a near miss to land in it. */
const NEAR = 0.25;
/** How close to the edge of a scrolling screen a held card starts to scroll it. */
const EDGE = 72;
/** The most a held card scrolls the screen in one frame. */
const SCROLL = 16;

const inside = (box: Box, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
const area = (box: Box) =>
  Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
const shared = (a: Box, b: Box) =>
  area({
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  });

/**
 * The place a held card is over. The place under the finger wins, the
 * smallest where places nest. A card let go beside a place still lands in
 * it when a quarter of the card lies over it, since a small hand is not
 * exact. The pile takes a card only when no place does.
 */
export function placeUnder(
  point: { x: number; y: number },
  card: Box,
  places: readonly Place[],
  pile: string,
): string | null {
  const real = places.filter((place) => place.id !== pile);
  const under = real
    .filter((place) => inside(place.box, point.x, point.y))
    .toSorted((a, b) => area(a.box) - area(b.box))[0];
  if (under) return under.id;
  const near = real
    .map((place) => ({ id: place.id, over: shared(place.box, card) }))
    .toSorted((a, b) => b.over - a.over)[0];
  if (near && near.over >= area(card) * NEAR && near.over > 0) return near.id;
  return places.some(
    (place) => place.id === pile && inside(place.box, point.x, point.y),
  )
    ? pile
    : null;
}

interface Drag {
  source: HTMLElement;
  ghost: HTMLElement | null;
  startX: number;
  startY: number;
  /** Where on the card the finger took hold. */
  dx: number;
  dy: number;
  x: number;
  y: number;
  width: number;
  height: number;
  places: { id: string; element: HTMLElement; box: Box }[];
  /** The places moved under the card, as when the screen scrolled. */
  stale: boolean;
  over: string | null;
  frame: number;
  scroller: Element | null;
  watch: () => void;
}

const still = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The nearest thing around a card that scrolls up and down. */
function scrollerOf(element: HTMLElement): Element | null {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const { overflowY } = getComputedStyle(parent);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      parent.scrollHeight > parent.clientHeight + 1
    )
      return parent;
  }
  return document.scrollingElement;
}

function measure(drag: Drag) {
  const root = drag.source.closest("dialog") ?? document;
  drag.places = [...root.querySelectorAll<HTMLElement>("[data-spot]")].map(
    (element) => ({
      id: element.dataset.spot ?? "",
      element,
      box: element.getBoundingClientRect(),
    }),
  );
  drag.stale = false;
}

function mark(drag: Drag, over: string | null) {
  if (over === drag.over) return;
  for (const place of drag.places) place.element.removeAttribute("data-over");
  drag.places
    .find((place) => place.id === over)
    ?.element.setAttribute("data-over", "");
  drag.over = over;
}

/**
 * Lifts a copy of the card to follow the finger. The copy takes none of
 * the card's own easing: with it, every move was eased over 150ms and the
 * copy trailed the finger by a finger's width.
 */
function lift(drag: Drag) {
  const { source } = drag;
  const box = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0",
    top: "0",
    margin: "0",
    width: `${box.width}px`,
    height: `${box.height}px`,
    pointerEvents: "none",
    zIndex: "60",
    transition: "none",
    willChange: "transform",
  });
  (source.closest("dialog") ?? document.body).append(ghost);
  drag.ghost = ghost;
  drag.width = box.width;
  drag.height = box.height;
  source.style.opacity = "0.35";
  drag.scroller = scrollerOf(source);
  measure(drag);
  window.addEventListener("scroll", drag.watch, {
    capture: true,
    passive: true,
  });
}

const placed = (x: number, y: number, scale: number) =>
  `translate3d(${x}px, ${y}px, 0) scale(${scale})`;

/** One frame of a drag: the copy moves, the place under it lights, the screen scrolls. */
function step(drag: Drag, pile: string) {
  drag.frame = 0;
  const { ghost } = drag;
  if (!ghost) return;
  if (drag.stale) measure(drag);
  const left = drag.x - drag.dx;
  const top = drag.y - drag.dy;
  ghost.style.transform = placed(left, top, 1.05);
  mark(
    drag,
    placeUnder(
      { x: drag.x, y: drag.y },
      { left, top, right: left + drag.width, bottom: top + drag.height },
      drag.places,
      pile,
    ),
  );
  const { scroller } = drag;
  if (!scroller) return;
  const view =
    scroller === document.scrollingElement
      ? { top: 0, bottom: window.innerHeight }
      : scroller.getBoundingClientRect();
  const pull =
    drag.y < view.top + EDGE
      ? -(view.top + EDGE - drag.y) / EDGE
      : drag.y > view.bottom - EDGE
        ? (drag.y - (view.bottom - EDGE)) / EDGE
        : 0;
  if (pull === 0) return;
  const before = scroller.scrollTop;
  scroller.scrollTop += Math.max(-1, Math.min(1, pull)) * SCROLL;
  // Held at the edge, the card keeps scrolling without the finger moving.
  if (scroller.scrollTop !== before) {
    drag.stale = true;
    drag.frame = requestAnimationFrame(() => step(drag, pile));
  }
}

function release(drag: Drag) {
  if (drag.frame) cancelAnimationFrame(drag.frame);
  window.removeEventListener("scroll", drag.watch, { capture: true });
  for (const place of drag.places) place.element.removeAttribute("data-over");
}

/** Glides the copy onto where the card now sits, or sat, then lets it go. */
function land(drag: Drag, onto: HTMLElement | null, after: () => void) {
  const { ghost, source } = drag;
  const finish = () => {
    ghost?.remove();
    source.style.opacity = "";
    after();
  };
  if (!ghost || !onto || still()) {
    finish();
    return;
  }
  const to = onto.getBoundingClientRect();
  ghost
    .animate(
      [
        { transform: ghost.style.transform },
        { transform: placed(to.left, to.top, 1) },
      ],
      { duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    )
    .finished.then(finish, finish);
}

/**
 * Lets a child drag a card to a place. The card's copy follows the finger
 * a frame at a time, lights the place it would land in, scrolls a long
 * screen from its edges, and glides into place when let go; let go over
 * nothing, it glides home. A press that never travels stays a tap.
 */
export function useCardDrag(options: {
  locked: boolean;
  /** The pile's own place, which takes a card only when no other does. */
  pile: string;
  /** Puts the card in a place. */
  onDrop: (place: string) => void;
  /** The card as it is drawn now, which a drop may have moved. */
  card: () => HTMLElement | undefined;
}) {
  const held = useRef<Drag | null>(null);
  const dragged = useRef(false);

  const stop = () => {
    const drag = held.current;
    if (!drag) return;
    held.current = null;
    release(drag);
    land(drag, null, () => undefined);
  };

  return {
    /** Whether the press that just ended was a drag, which a tap must not follow. */
    wasDragged: () => {
      const was = dragged.current;
      dragged.current = false;
      return was;
    },
    handlers: {
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        // One finger moves a card; a second one resting on the screen does not.
        if (options.locked || event.button !== 0 || !event.isPrimary) return;
        const box = event.currentTarget.getBoundingClientRect();
        const drag: Drag = {
          source: event.currentTarget,
          ghost: null,
          startX: event.clientX,
          startY: event.clientY,
          dx: event.clientX - box.left,
          dy: event.clientY - box.top,
          x: event.clientX,
          y: event.clientY,
          width: box.width,
          height: box.height,
          places: [],
          stale: false,
          over: null,
          frame: 0,
          scroller: null,
          watch: () => {
            drag.stale = true;
          },
        };
        held.current = drag;
        dragged.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        const drag = held.current;
        if (!drag) return;
        drag.x = event.clientX;
        drag.y = event.clientY;
        if (!drag.ghost) {
          if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < START)
            return;
          lift(drag);
          dragged.current = true;
          if (event.pointerType === "touch" && "vibrate" in navigator)
            navigator.vibrate(8);
        }
        // However often the finger reports, the screen is drawn once a frame.
        if (!drag.frame)
          drag.frame = requestAnimationFrame(() => step(drag, options.pile));
      },
      onPointerUp: () => {
        const drag = held.current;
        if (!drag) return;
        held.current = null;
        if (!drag.ghost) return;
        // The last move may still be waiting for its frame.
        if (drag.frame) cancelAnimationFrame(drag.frame);
        step(drag, options.pile);
        const { over } = drag;
        release(drag);
        if (!over) {
          land(drag, drag.source, () => undefined);
          return;
        }
        // The card is drawn in its place at once, hidden under its copy
        // until the copy has glided onto it.
        flushSync(() => options.onDrop(over));
        const now = options.card() ?? null;
        if (now) now.style.visibility = "hidden";
        land(drag, now, () => {
          if (now) now.style.visibility = "";
        });
      },
      onPointerCancel: stop,
      onLostPointerCapture: stop,
    },
  };
}
