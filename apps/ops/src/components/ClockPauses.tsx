import type { DunningPauseRow } from "@faridalms/database/business/dunning";

import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import { formatDay } from "../format";
import { useMay } from "../may";
import { endClockPause, pauseClock } from "../server/receivables";

/**
 * A customer's pauses of the dunning clock, and a form to add one: while a
 * pause runs, no reminder goes out and the school's access does not change.
 */
export function ClockPauses({
  customerId,
  pauses,
  today,
}: {
  customerId: string;
  pauses: readonly DunningPauseRow[];
  today: string;
}) {
  const router = useRouter();
  const mayBill = useMay("billing");
  const add = useServerFn(pauseClock);
  const end = useServerFn(endClockPause);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <div className="grid gap-3">
      <h3 className="text-sm font-semibold">Reminders and access</h3>
      {pauses.length ? (
        <ul className="divide-y rounded-lg border text-sm">
          {pauses.map((pause) => (
            <li
              key={pause.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <span>
                Paused {formatDay(pause.startsOn)} to {formatDay(pause.endsOn)}
                <span className="text-muted-foreground"> · {pause.reason}</span>
              </span>
              {mayBill && pause.endsOn > today ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const out = await end({ data: { id: pause.id } });
                      if (out.ok) {
                        toast.success("The pause ends today.");
                        await router.invalidate();
                      } else toast.error(out.message);
                    } catch (error) {
                      const said = failure(error, "The pause could not end.");
                      if (said) toast.error(said);
                    }
                  }}
                >
                  End today
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          The clock has never been paused.
        </p>
      )}
      {mayBill ? (
        <form
          aria-label="Pause the clock"
          className="grid gap-3 rounded-lg border p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setAnswer(null);
            try {
              const out = await add({
                data: { customerId, startsOn, endsOn, reason },
              });
              if (out.ok) {
                toast.success("The clock is paused.");
                setEndsOn("");
                setReason("");
                await router.invalidate();
              } else setAnswer(out.message);
            } catch (error) {
              setAnswer(
                failure(
                  error,
                  "The pause could not be kept. It needs both days and a reason.",
                ),
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <p className="text-sm text-muted-foreground">
            Pause it for a purchase order in process, a disputed amount or a
            government approval, rather than changing the school's access by
            hand.
          </p>
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5 text-sm">
              <label htmlFor="pause-from" className="font-medium">
                From
              </label>
              <Input
                id="pause-from"
                type="date"
                required
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5 text-sm">
              <label htmlFor="pause-until" className="font-medium">
                Until
              </label>
              <Input
                id="pause-until"
                type="date"
                required
                min={startsOn}
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5 text-sm sm:col-span-2">
              <label htmlFor="pause-reason" className="font-medium">
                Why
              </label>
              <Textarea
                id="pause-reason"
                required
                maxLength={500}
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>
          {answer ? (
            <p role="alert" className="text-sm text-destructive">
              {answer}
            </p>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={saving}
            className="justify-self-start"
          >
            {saving ? "Pausing…" : "Pause the clock"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
