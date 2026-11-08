import type { Placement, ReferenceElement } from "@floating-ui/dom";
import type { ReactElement, ReactNode } from "react";

import { Tooltip } from "@base-ui/react/tooltip";
import {
  autoUpdate,
  computePosition,
  flip,
  inline,
  offset,
  shift,
  size,
} from "@floating-ui/dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * State an editor listener sets on every update. React queues a set state
 * even when the value is unchanged, on a component that may not draw again
 * for as long as someone types, and the queue empties only when it draws;
 * this sets state only when the value changed.
 */
export function useListenerState<T>(
  initial: T,
  same: (a: T, b: T) => boolean = Object.is,
): [T, (next: T) => void] {
  const [value, setValue] = useState(initial);
  const last = useRef(initial);
  const set = useCallback(
    (next: T) => {
      if (same(last.current, next)) return;
      last.current = next;
      setValue(next);
    },
    [same],
  );
  return [value, set];
}

export const sameJson = <T,>(a: T, b: T) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

export function Floating({
  reference,
  placement = "bottom-start",
  children,
  className,
  keepFocus = false,
  label,
  role,
  id,
  container,
  boundary,
  keepInView = false,
}: {
  reference: ReferenceElement | null;
  placement?: Placement;
  children: ReactNode;
  className?: string;
  keepFocus?: boolean;
  label?: string;
  role?: string;
  id?: string;
  container?: HTMLElement | null;
  /** Keeps it within this element, such as the editor's text, not just the window. */
  boundary?: Element | null;
  /**
   * A tall panel slides up or down to stay on screen, covering the text it
   * belongs to rather than running off the top or bottom of the window.
   */
  keepInView?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      ref.current = element;
      if (!element) return undefined;
      const prevent = (event: MouseEvent) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      };
      const move = (event: KeyboardEvent) => moveAlongToolbar(element, event);
      if (keepFocus) element.addEventListener("mousedown", prevent);
      if (role === "toolbar") element.addEventListener("keydown", move);
      return () => {
        element.removeEventListener("mousedown", prevent);
        element.removeEventListener("keydown", move);
      };
    },
    [keepFocus, role],
  );
  useEffect(() => {
    const floating = ref.current;
    if (!floating || !reference) return undefined;
    return autoUpdate(reference, floating, () => {
      // Never wider than the space it is kept in, so a long bar wraps rather
      // than running off a phone's screen, where shifting cannot help.
      const room = Math.min(
        boundary?.getBoundingClientRect().width ?? window.innerWidth,
        window.innerWidth,
      );
      floating.style.maxWidth = `${Math.max(0, room - 16)}px`;
      void computePosition(reference, floating, {
        placement,
        strategy: "fixed",
        middleware: [
          inline(),
          offset(8),
          flip({ padding: 8, ...(boundary ? { boundary } : {}) }),
          shift({
            padding: 8,
            crossAxis: keepInView,
            ...(boundary ? { boundary } : {}),
          }),
          // A panel taller than a phone's window would be cut off where a
          // fixed element cannot be scrolled to; it scrolls inside instead.
          ...(keepInView
            ? [
                size({
                  padding: 8,
                  apply: ({ availableHeight }) => {
                    floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
                    floating.style.overflowY = "auto";
                  },
                }),
              ]
            : []),
        ],
      }).then(({ x, y }) => {
        floating.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        floating.style.visibility = "visible";
      });
    });
  }, [reference, placement, boundary, keepInView]);
  if (!reference) return null;
  return createPortal(
    <div
      ref={attach}
      id={id}
      role={role}
      aria-label={label}
      style={{ position: "fixed", top: 0, left: 0, visibility: "hidden" }}
      className={cx(
        "z-50 rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none",
        className,
      )}
    >
      {children}
    </div>,
    container ?? document.body,
  );
}

export const TOOLBAR_CONTROLS =
  "button:not([disabled]), a[href], input:not([disabled]), [role=button]:not([aria-disabled=true])";

/**
 * Arrow keys move along a toolbar's controls, mirrored in right-to-left
 * text, and Home and End go to its ends, as the ARIA toolbar pattern has
 * it. A field in the bar keeps its arrows for its own caret.
 */
function moveAlongToolbar(bar: HTMLElement, event: KeyboardEvent) {
  const target = event.target;
  if (
    !(target instanceof HTMLElement) ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return;
  const controls = [
    ...bar.querySelectorAll<HTMLElement>(TOOLBAR_CONTROLS),
  ].filter((control) => control.closest("[role=toolbar]") === bar);
  const at = controls.indexOf(target);
  if (at === -1) return;
  const rtl = getComputedStyle(bar).direction === "rtl";
  const step =
    event.key === "ArrowRight"
      ? rtl
        ? -1
        : 1
      : event.key === "ArrowLeft"
        ? rtl
          ? 1
          : -1
        : 0;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? controls.length - 1
        : step
          ? (at + step + controls.length) % controls.length
          : -1;
  if (next === -1) return;
  event.preventDefault();
  controls[next]?.focus();
}

/**
 * The browser selection as something to position against, or nothing when it
 * lies outside `within`: with a menu focused, the selection can sit elsewhere
 * with an empty box at the window's corner.
 */
export function selectionReference(
  within?: Element | null,
): ReferenceElement | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  if (within && !within.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  return {
    getBoundingClientRect: () => range.getBoundingClientRect(),
    getClientRects: () => range.getClientRects(),
  };
}

export function Tip({
  label,
  shortcut,
  children,
  side = "top",
}: {
  label: string;
  shortcut?: string;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={6} className="z-60">
          <Tooltip.Popup className="flex items-center gap-2 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
            {label}
            {shortcut ? (
              <kbd className="font-sans text-background/60" dir="ltr">
                {shortcut}
              </kbd>
            ) : null}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function ToolButton({
  label,
  active,
  onClick,
  children,
  disabled,
  className,
  shortcut,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  shortcut?: string;
}) {
  return (
    <Tip label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        className={cx(
          "inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-accent aria-pressed:text-foreground [&_svg]:size-4",
          className,
        )}
      >
        {children}
      </button>
    </Tip>
  );
}

/**
 * Focuses a prompt as it opens. A prompt opened from the slash or insert
 * menu opens inside the editor update that removes the typed command, and
 * Lexical hands focus back to the text as that update lands, after the
 * prompt has drawn; so it takes focus again on the next frame.
 */
export function focusOnOpen(element: HTMLElement | null) {
  if (!element) return;
  element.focus();
  requestAnimationFrame(() => {
    if (element.isConnected && document.activeElement !== element)
      element.focus();
  });
}

export const menuItemClass =
  "flex w-full cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-start text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export const menuPopupClass =
  "z-50 min-w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0";

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent);

export function shortcutLabel(keys: string): string {
  return keys
    .replace("Mod", isMac ? "⌘" : "Ctrl")
    .replace("Alt", isMac ? "⌥" : "Alt")
    .replace("Shift", isMac ? "⇧" : "Shift");
}
