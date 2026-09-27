import type { ReactNode } from "react";

import { X } from "lucide-react";
import { useRef } from "react";

import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { cn } from "~/utils/cn";

/**
 * Details kept off the page until asked for, in a panel from the end side:
 * who a notice reached, a document's history. It reads; SheetForm edits.
 *
 * With `context`, the panel peeks at an item instead: the header row carries
 * what kind of thing it is, and the title opens the body as the item's own
 * heading, the way the item reads as a page.
 */
export function SheetPanel({
  open,
  onOpenChange,
  title,
  description,
  context,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  context?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const side = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  // Reading starts at the title rather than on the first button, which a
  // focus ring would otherwise single out as if it were chosen.
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        showCloseButton={false}
        initialFocus={heading}
        className="gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[560px] data-[side=right]:sm:max-w-[560px]"
      >
        {context ? (
          <div className="flex min-h-14 items-center gap-2 px-6 pe-14 max-md:pe-16">
            {context}
          </div>
        ) : (
          <SheetHeader className="border-b px-6 py-4 pe-14 max-md:pe-16">
            <SheetTitle
              ref={heading}
              tabIndex={-1}
              className="text-base leading-6 font-semibold outline-none"
            >
              {title}
            </SheetTitle>
            {description ? (
              <SheetDescription className="text-[13px] leading-[18px]">
                {description}
              </SheetDescription>
            ) : null}
          </SheetHeader>
        )}
        <div
          className={cn(
            "grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-6",
            context ? "pt-2" : "pt-6",
            footer ? "pb-6" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          )}
        >
          {context ? (
            <SheetTitle
              ref={heading}
              tabIndex={-1}
              className="text-2xl leading-8 font-semibold tracking-tight break-words outline-none"
            >
              <bdi>{title}</bdi>
            </SheetTitle>
          ) : null}
          {children}
        </div>
        {footer ? (
          <div className="flex flex-wrap items-center gap-2 border-t px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
        <SheetClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={m.commonClose()}
              className="absolute end-4 top-3 max-md:top-2 max-md:size-10"
            />
          }
        >
          <X aria-hidden />
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
