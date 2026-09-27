import type { ReactNode } from "react";

import { X } from "lucide-react";

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

/**
 * Details kept off the page until asked for, in a panel from the end side:
 * who a notice reached, a document's history. It reads; SheetForm edits.
 */
export function SheetPanel({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const side = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        showCloseButton={false}
        className="gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[560px] data-[side=right]:sm:max-w-[560px]"
      >
        <SheetHeader className="border-b px-6 py-4 pe-14 max-md:pe-16">
          <SheetTitle className="text-base leading-6 font-semibold">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="text-[13px] leading-[18px]">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
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
