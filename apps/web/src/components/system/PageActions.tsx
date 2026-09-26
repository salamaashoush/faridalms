import type { ReactNode } from "react";

import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";

interface Slots {
  leading: HTMLElement | null;
  trailing: HTMLElement | null;
}

const SlotContext = createContext<Slots>({ leading: null, trailing: null });
const SetSlotContext = createContext<{
  leading: (element: HTMLElement | null) => void;
  trailing: (element: HTMLElement | null) => void;
}>({ leading: () => undefined, trailing: () => undefined });

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [leading, setLeading] = useState<HTMLElement | null>(null);
  const [trailing, setTrailing] = useState<HTMLElement | null>(null);
  const [setters] = useState(() => ({
    leading: setLeading,
    trailing: setTrailing,
  }));
  return (
    <SetSlotContext.Provider value={setters}>
      <SlotContext.Provider value={{ leading, trailing }}>
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

/**
 * An editor's controls live in the workspace header: a way back before the
 * breadcrumb, and its status and actions where the global tools usually sit.
 * One bar, no floating footer. The slots exist only in the browser, which
 * matches the editors' rule of staying disabled until hydrated.
 */
export function PageActions({
  leading,
  children,
}: {
  leading?: ReactNode;
  children: ReactNode;
}) {
  const slots = useContext(SlotContext);
  return (
    <>
      {slots.leading && leading ? createPortal(leading, slots.leading) : null}
      {slots.trailing ? createPortal(children, slots.trailing) : null}
    </>
  );
}
