import type { ReactNode } from "react";

import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";

interface Slots {
  leading: HTMLElement | null;
  meta: HTMLElement | null;
  trailing: HTMLElement | null;
}

const SlotContext = createContext<Slots>({
  leading: null,
  meta: null,
  trailing: null,
});
interface SlotSetters {
  leading: (element: HTMLElement | null) => void;
  meta: (element: HTMLElement | null) => void;
  trailing: (element: HTMLElement | null) => void;
}

const SetSlotContext = createContext<SlotSetters>({
  leading: () => undefined,
  meta: () => undefined,
  trailing: () => undefined,
});

export interface PageActionsProviderProps {
  children: ReactNode;
}

/** Holds the top bar's slots, which a page fills with PageActions. */
export function PageActionsProvider({ children }: PageActionsProviderProps) {
  const [leading, setLeading] = useState<HTMLElement | null>(null);
  const [meta, setMeta] = useState<HTMLElement | null>(null);
  const [trailing, setTrailing] = useState<HTMLElement | null>(null);
  const [setters] = useState(() => ({
    leading: setLeading,
    meta: setMeta,
    trailing: setTrailing,
  }));
  return (
    <SetSlotContext.Provider value={setters}>
      <SlotContext.Provider value={{ leading, meta, trailing }}>
        {children}
      </SlotContext.Provider>
    </SetSlotContext.Provider>
  );
}

export function PageLeadingSlot() {
  const { leading } = useContext(SetSlotContext);
  return (
    <div
      ref={leading}
      data-slot="page-leading"
      className="flex shrink-0 items-center empty:hidden"
    />
  );
}

/** Just after the breadcrumb: what belongs to the page's name, such as a count. */
export function PageMetaSlot() {
  const { meta } = useContext(SetSlotContext);
  return (
    <div
      ref={meta}
      data-slot="page-meta"
      className="flex shrink-0 items-center gap-2 empty:hidden"
    />
  );
}

export function PageActionsSlot() {
  const { trailing } = useContext(SetSlotContext);
  return (
    <div
      ref={trailing}
      data-slot="page-actions"
      className="flex min-w-0 shrink-0 items-center gap-2 empty:hidden"
    />
  );
}

export interface PageActionsProps {
  /** Before the breadcrumb, such as a way back. */
  leading?: ReactNode;
  /** Beside the page's name in the breadcrumb, such as how many there are. */
  meta?: ReactNode;
  children?: ReactNode;
}

/**
 * The page's own part of the top bar: a way back before the breadcrumb,
 * what qualifies the page's name beside it, and its status and actions
 * where the global tools usually sit. One bar, no floating footer. The
 * slots exist only in the browser, so what is put there appears once the
 * page has hydrated, when its buttons start to work anyway.
 */
export function PageActions({ leading, meta, children }: PageActionsProps) {
  const slots = useContext(SlotContext);
  return (
    <>
      {slots.leading && leading ? createPortal(leading, slots.leading) : null}
      {slots.meta && meta ? createPortal(meta, slots.meta) : null}
      {slots.trailing && children
        ? createPortal(children, slots.trailing)
        : null}
    </>
  );
}
