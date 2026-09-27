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
} from "@floating-ui/dom";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

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
}) {
  const ref = useRef<HTMLDivElement>(null);
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      ref.current = element;
      if (!element || !keepFocus) return undefined;
      const prevent = (event: MouseEvent) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      };
      element.addEventListener("mousedown", prevent);
      return () => element.removeEventListener("mousedown", prevent);
    },
    [keepFocus],
  );
  useEffect(() => {
    const floating = ref.current;
    if (!floating || !reference) return undefined;
    return autoUpdate(reference, floating, () => {
      void computePosition(reference, floating, {
        placement,
        strategy: "fixed",
        middleware: [
          inline(),
          offset(8),
          flip({ padding: 8, ...(boundary ? { boundary } : {}) }),
          shift({ padding: 8, ...(boundary ? { boundary } : {}) }),
        ],
      }).then(({ x, y }) => {
        floating.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        floating.style.visibility = "visible";
      });
    });
  }, [reference, placement, boundary]);
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
