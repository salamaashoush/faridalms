import { TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import { pauseClock } from "../server/receivables";
import { WhyField } from "./Why";

export interface PauseSheetProps {
  customerId: string;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Pauses the dunning clock for a purchase order in process, a disputed
 * amount or a government approval, rather than changing access by hand.
 */
export function PauseSheet({
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
      title="Pause reminders"
      submitLabel="Pause reminders"
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
        toast.success("Reminders are paused.");
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
