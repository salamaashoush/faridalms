import type { ReactNode } from "react";

import { Button } from "../button";
import { cn } from "../cn";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../sheet";
import { X } from "lucide-react";
import { useId, useRef } from "react";

import { useEndSide, useSystemStrings } from "./provider";

export interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /**
   * Beside the page, where the screen is wide enough to keep both in view;
   * otherwise a sheet over it.
   */
  docked: boolean;
  /** On a phone the sheet rises from the bottom rather than the end side. */
  phone?: boolean;
  children: ReactNode;
}

/**
 * A panel that works alongside the page rather than instead of it, such as
 * the comments on a document being written (Google Docs, Notion): docked
 * at the end side below the top bar on wide screens, so the page stays in
 * reach, and a sheet on narrower ones. The page leaves room for it with
 * `sidePanelRoom` while it is docked open.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  docked,
  phone = false,
  children,
}: SidePanelProps) {
  const strings = useSystemStrings();
  const side = useEndSide();
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  if (docked)
    return open ? (
      <aside
        aria-labelledby={id}
        className="fixed end-0 top-12 bottom-0 z-20 flex w-[22.5rem] flex-col border-s bg-background print:hidden"
      >
        <div className="flex min-h-12 items-center gap-2 border-b ps-4 pe-2">
          <h2 id={id} className="flex-1 truncate text-sm font-semibold">
            {title}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={strings.close}
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden />
          </Button>
        </div>
        <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-3">
          {children}
        </div>
      </aside>
    ) : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? "bottom" : side}
        showCloseButton={false}
        initialFocus={heading}
        className="gap-0 p-0 data-[side=bottom]:max-h-[88dvh] data-[side=bottom]:rounded-t-xl data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[400px] data-[side=right]:sm:max-w-[400px]"
      >
        <SheetHeader className="border-b px-5 py-3.5 pe-14">
          <SheetTitle
            ref={heading}
            tabIndex={-1}
            className="text-base leading-6 font-semibold outline-none"
          >
            {title}
          </SheetTitle>
        </SheetHeader>
        <div
          className={cn(
            "grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4",
            "pb-[max(1rem,env(safe-area-inset-bottom))]",
          )}
        >
          {children}
        </div>
        <SheetClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={strings.close}
              className="absolute end-4 top-3 max-md:size-10"
            />
          }
        >
          <X aria-hidden />
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}

/** The room a page leaves at its end side for a docked side panel. */
export const sidePanelRoom = "lg:pe-[22.5rem]";
