import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { Printer, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef } from "react";
import { createPortal } from "react-dom";

import * as m from "~/i18n/messages";

/**
 * Something made for paper and shown once, such as sign-in badges or slips:
 * the sheet covers the app while open and is all that prints. Closing it
 * drops what it shows, so it says what cannot be shown again before it goes.
 */
export function PaperSheet({
  title,
  hint,
  notes = [],
  warnings = [],
  onDone,
  children,
}: {
  title: string;
  hint: string;
  /** What was left as it was, for the office to know. */
  notes?: readonly string[];
  /** What did not make it onto the paper, for the office to act on. */
  warnings?: readonly string[];
  onDone: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const sheet = useRef<HTMLDialogElement>(null);
  const print = useRef<HTMLButtonElement>(null);
  const done = useEffectEvent(onDone);

  useEffect(() => {
    const others = [...document.body.children].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== sheet.current,
    );
    for (const element of others) element.inert = true;
    print.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") done();
    };
    document.addEventListener("keydown", close);
    return () => {
      for (const element of others) element.inert = false;
      document.removeEventListener("keydown", close);
    };
  }, []);

  return createPortal(
    <dialog
      ref={sheet}
      open
      data-print-sheet
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 m-0 size-full max-h-none max-w-none overflow-auto border-0 bg-muted p-0 text-foreground print:static print:size-auto print:overflow-visible print:bg-white"
    >
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="grid min-w-0 flex-1 basis-80 gap-0.5">
            <h2 id={titleId} className="text-base leading-6 font-semibold">
              {title}
            </h2>
            {[hint, ...notes].map((line) => (
              <p
                key={line}
                className="text-[13px] leading-[18px] text-muted-foreground"
              >
                {line}
              </p>
            ))}
            {warnings.map((warning) => (
              <p
                key={warning}
                className="flex items-start gap-1.5 text-[13px] leading-[18px] text-warning-foreground dark:text-warning"
              >
                <TriangleAlert
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0"
                />
                {warning}
              </p>
            ))}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={onDone}
            >
              {m.badgesDone()}
            </Button>
            <Button
              ref={print}
              type="button"
              className="max-md:h-10"
              onClick={() => window.print()}
            >
              <Printer aria-hidden />
              {m.badgesPrint()}
            </Button>
          </div>
        </div>
      </div>
      <div className="mx-auto my-6 w-fit max-w-full bg-white p-[10mm] shadow-sm print:m-0 print:p-0 print:shadow-none">
        {children}
      </div>
    </dialog>,
    document.body,
  );
}
