import { Button } from "@faridalms/ui/button";
import { Camera, Printer, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useRef } from "react";
import { createPortal } from "react-dom";

import { initialsOf } from "~/components/app/UserMenu";
import * as m from "~/i18n/messages";

import { QrCode } from "./QrCode";

export interface PrintedBadge {
  studentId: string;
  name: string;
  secret: string;
}

// Five soft colours, so two neighbours on a sheet rarely share one and a
// child who cannot read finds their own card by its colour and letter.
const TONES = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe"];

/**
 * New badges laid out on paper, credit-card size, eight to an A4 page. The
 * sheet covers the app while open and is all that prints; closing it drops
 * the secrets, which the API never shows twice.
 */
export function BadgeSheet({
  badges,
  school,
  schoolName,
  className,
  disabled,
  onDone,
}: {
  badges: PrintedBadge[];
  school: string;
  schoolName: string;
  className: string;
  disabled: boolean;
  onDone: () => void;
}) {
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

  const origin = window.location.origin;
  return createPortal(
    <dialog
      ref={sheet}
      open
      data-print-sheet
      aria-modal="true"
      aria-labelledby="badge-sheet-title"
      className="fixed inset-0 z-50 m-0 size-full max-h-none max-w-none overflow-auto border-0 bg-muted p-0 text-foreground print:static print:size-auto print:overflow-visible print:bg-white"
    >
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="grid gap-0.5">
            <h2
              id="badge-sheet-title"
              className="text-base leading-6 font-semibold"
            >
              {m.badgesSheetTitle({ class: className })}
            </h2>
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {m.badgesReady()}
            </p>
            {disabled ? (
              <p className="flex items-center gap-1.5 text-[13px] leading-[18px] text-warning-foreground dark:text-warning">
                <TriangleAlert aria-hidden className="size-3.5" />
                {m.badgesDisabled()}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onDone}>
              {m.badgesDone()}
            </Button>
            <Button ref={print} type="button" onClick={() => window.print()}>
              <Printer aria-hidden />
              {m.badgesPrint()}
            </Button>
          </div>
        </div>
      </div>
      <div className="mx-auto my-6 w-fit bg-white p-[10mm] shadow-sm print:m-0 print:p-0 print:shadow-none">
        <ul className="grid grid-cols-[repeat(2,85.6mm)] gap-[4mm]">
          {badges.map((badge, index) => {
            const url = `${origin}/badge?school=${encodeURIComponent(school)}#${badge.secret}`;
            return (
              <li
                key={badge.studentId}
                className="flex h-[54mm] w-[85.6mm] break-inside-avoid items-center gap-[3mm] rounded-[3mm] border border-dashed border-neutral-400 bg-white p-[3mm] text-neutral-950"
              >
                <QrCode value={url} className="size-[42mm] shrink-0" />
                <div className="grid h-full min-w-0 flex-1 content-between">
                  <span
                    aria-hidden
                    className="grid size-[11mm] place-items-center rounded-full text-[14pt] font-bold"
                    style={{
                      backgroundColor: TONES[index % TONES.length],
                      printColorAdjust: "exact",
                    }}
                  >
                    {initialsOf(badge.name)}
                  </span>
                  <div className="grid gap-[1mm]">
                    <p
                      dir="auto"
                      className="line-clamp-3 text-[13pt] leading-tight font-bold break-words"
                    >
                      {badge.name}
                    </p>
                    <p dir="auto" className="truncate text-[8pt] leading-tight">
                      {className}
                    </p>
                    <p
                      dir="auto"
                      className="truncate text-[7pt] leading-tight text-neutral-600"
                    >
                      {schoolName}
                    </p>
                  </div>
                  <p className="flex items-center gap-[1mm] text-[7pt] leading-tight">
                    <Camera aria-hidden className="size-[3.5mm] shrink-0" />
                    {m.badgesCardHint()}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </dialog>,
    document.body,
  );
}
