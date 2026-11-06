import type { DunningPauseRow } from "@faridalms/database/business/dunning";

import { Button } from "@faridalms/ui/button";
import { TextField } from "@faridalms/ui/system/form-field";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Pause } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import { formatDay } from "../format";
import { useMay } from "../may";
import { endClockPause, pauseClock } from "../server/receivables";
import { WhyField } from "./Why";

interface PauseSheetProps {
  customerId: string;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Pauses the dunning clock for a purchase order in process, a disputed
 * amount or a government approval, rather than changing access by hand.
 */
function PauseSheet({
  customerId,
  today,
  open,
  onOpenChange,
}: PauseSheetProps) {
  const router = useRouter();
  const add = useServerFn(pauseClock);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Pause the clock"
      submitLabel="Pause the clock"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!startsOn || !endsOn || !reason.trim()) return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () => add({ data: { customerId, startsOn, endsOn, reason } }),
          "The pause could not be kept.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("The clock is paused.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        For a purchase order in process, a disputed amount or a government
        approval, rather than changing the school's access by hand.
      </p>
      <div className="grid items-start gap-6 sm:grid-cols-2">
        <TextField
          label="From"
          type="date"
          width="date"
          value={startsOn}
          errors={
            submitted && !startsOn ? ["Choose the first day."] : undefined
          }
          onChange={(event) => setStartsOn(event.target.value)}
        />
        <TextField
          label="Until"
          type="date"
          width="date"
          min={startsOn}
          value={endsOn}
          errors={submitted && !endsOn ? ["Choose the last day."] : undefined}
          onChange={(event) => setEndsOn(event.target.value)}
        />
      </div>
      <WhyField value={reason} onChange={setReason} submitted={submitted} />
    </SheetForm>
  );
}

export interface ClockPausesProps {
  customerId: string;
  pauses: readonly DunningPauseRow[];
  today: string;
}

/**
 * A customer's pauses of the dunning clock: while a pause runs, no reminder
 * goes out and the school's access does not change.
 */
export function ClockPauses({ customerId, pauses, today }: ClockPausesProps) {
  const router = useRouter();
  const mayBill = useMay("billing");
  const end = useServerFn(endClockPause);
  const sheet = useSheet();
  return (
    <RecordSection
      title="Reminders and access"
      description="While a pause runs, no reminder goes out and the school's access does not change."
      action={
        mayBill ? (
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={sheet.show}
          >
            <Pause aria-hidden />
            Pause the clock
          </Button>
        ) : undefined
      }
    >
      {pauses.length ? (
        <RecordList>
          {pauses.map((pause) => (
            <li
              key={pause.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <span className="grid gap-0.5">
                <span className="text-sm leading-5">
                  Paused {formatDay(pause.startsOn)} to{" "}
                  {formatDay(pause.endsOn)}
                </span>
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {pause.reason}
                </span>
              </span>
              {mayBill && pause.endsOn > today ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const failed = await attempt(
                      () => end({ data: { id: pause.id } }),
                      "The pause could not end.",
                    );
                    if (failed) toast.error(failed);
                    else {
                      toast.success("The pause ends today.");
                      await router.invalidate();
                    }
                  }}
                >
                  End today
                </Button>
              ) : null}
            </li>
          ))}
        </RecordList>
      ) : (
        <RecordEmpty>The clock has never been paused.</RecordEmpty>
      )}
      {mayBill ? (
        <PauseSheet
          key={sheet.key}
          customerId={customerId}
          today={today}
          open={sheet.open}
          onOpenChange={sheet.onOpenChange}
        />
      ) : null}
    </RecordSection>
  );
}
