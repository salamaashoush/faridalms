import { Button } from "@faridalms/ui/button";
import { initialsOf } from "@faridalms/ui/system/app-shell";
import { Camera, Nfc } from "lucide-react";
import { toast } from "sonner";

import { nfcAvailable, writeBadgeCard } from "~/components/auth/nfc";
import { QrCode } from "~/components/print/QrCode";
import { PaperSheet } from "~/components/system/PaperSheet";
import * as m from "~/i18n/messages";

export interface PrintedBadge {
  studentId: string;
  name: string;
  /** The child's own class, when the badges on a sheet are of several. */
  className?: string | null;
  secret: string;
}

// Five soft colours, so two neighbours on a sheet rarely share one and a
// child who cannot read finds their own card by its colour and letter.
const TONES = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe"];

export interface BadgeSheetProps {
  badges: PrintedBadge[];
  schoolName: string;
  /** The class printed on each card; none when the badges are of several. */
  className: string | null;
  notes?: readonly string[];
  warnings?: readonly string[];
  onDone: () => void;
}

/**
 * New badges laid out on paper, credit-card size, eight to an A4 page.
 * Closing the sheet drops the secrets, which the API never shows twice.
 */
export function BadgeSheet({
  badges,
  schoolName,
  className,
  notes,
  warnings,
  onDone,
}: BadgeSheetProps) {
  const origin = window.location.origin;
  // A badge can go on a card only now, while its secret is shown.
  const cards = nfcAvailable();
  return (
    <PaperSheet
      title={
        className ? m.badgesSheetTitle({ class: className }) : m.badgesTitle()
      }
      hint={m.badgesReady()}
      notes={notes}
      warnings={warnings}
      onDone={onDone}
    >
      <ul className="grid grid-cols-[repeat(2,85.6mm)] gap-[4mm]">
        {badges.map((badge, index) => {
          const url = `${origin}/badge#${badge.secret}`;
          return (
            <li
              key={badge.studentId}
              className="relative flex h-[54mm] w-[85.6mm] break-inside-avoid items-center gap-[3mm] rounded-[3mm] border border-dashed border-neutral-400 bg-white p-[3mm] text-neutral-950"
            >
              {cards ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="absolute end-[2mm] top-[2mm] print:hidden"
                  onClick={() => {
                    const writing = toast.loading(
                      m.badgesCardWriting({ name: badge.name }),
                    );
                    writeBadgeCard(url).then(
                      () =>
                        toast.success(
                          m.badgesCardWritten({ name: badge.name }),
                          { id: writing },
                        ),
                      () =>
                        toast.error(m.badgesCardWriteFailed(), {
                          id: writing,
                        }),
                    );
                  }}
                >
                  <Nfc aria-hidden />
                  {m.badgesCardWrite()}
                </Button>
              ) : null}
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
                  {(badge.className ?? className) ? (
                    <p dir="auto" className="truncate text-[8pt] leading-tight">
                      {badge.className ?? className}
                    </p>
                  ) : null}
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
    </PaperSheet>
  );
}
