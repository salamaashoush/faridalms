import type { ReactNode } from "react";

import { Button } from "../button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../sheet";
import { CircleAlert, LoaderCircle, X } from "lucide-react";
import { useId } from "react";

import { useEndSide, useSystemStrings } from "./provider";

export interface SheetFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSubmit: () => void | Promise<unknown>;
  pending?: boolean;
  error?: string | null;
  /** Save, unless the submit does something more particular. */
  submitLabel?: string;
  /** The submit destroys something, so it takes the destructive colour. */
  destructive?: boolean;
  /** What happened to what is written so far, as a sheet that keeps a draft says. */
  status?: string | null;
  children: ReactNode;
}

/**
 * Edits one section of a record in a panel from the end side. Save and Cancel
 * sit at the bottom, start side, and Save is only disabled while the submit is
 * in flight. A submit that leaves a field invalid moves focus to the first
 * one, since the error may be out of view.
 */
export function SheetForm({
  open,
  onOpenChange,
  title,
  onSubmit,
  pending = false,
  error,
  submitLabel,
  destructive = false,
  status,
  children,
}: SheetFormProps) {
  const strings = useSystemStrings();
  const side = useEndSide();
  const titleId = useId();
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <SheetContent
        side={side}
        showCloseButton={false}
        className="gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[480px] data-[side=right]:sm:max-w-[480px]"
      >
        <form
          noValidate
          aria-labelledby={titleId}
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const form = event.currentTarget;
            void Promise.resolve(onSubmit()).then(() => {
              requestAnimationFrame(() => {
                form
                  .querySelector<HTMLElement>('[aria-invalid="true"]')
                  ?.focus();
              });
            });
          }}
        >
          <SheetHeader className="border-b px-6 py-4 pe-14 max-md:pe-16">
            <SheetTitle
              id={titleId}
              className="text-base leading-6 font-semibold"
            >
              {title}
            </SheetTitle>
          </SheetHeader>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-6 overflow-y-auto px-6 py-6">
            {error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm leading-5 text-destructive"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
            {children}
          </div>
          <SheetFooter className="mt-0 flex-row justify-start gap-2 border-t px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              className="max-md:h-10"
              disabled={pending}
            >
              {pending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : null}
              {submitLabel ?? strings.save}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {strings.cancel}
            </Button>
            {status ? (
              <span
                aria-live="polite"
                className="ms-auto self-center text-[13px] leading-[18px] text-muted-foreground"
              >
                {status}
              </span>
            ) : null}
          </SheetFooter>
        </form>
        {/* Centred on the title line: the header's 16px padding plus half of
            its 24px line is 28px, so a 32px button starts at 12px and a 40px
            one at 8px. */}
        <SheetClose
          disabled={pending}
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={strings.close}
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
