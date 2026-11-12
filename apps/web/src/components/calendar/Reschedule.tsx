import { rescheduled } from "@faridalms/domain/calendar";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { Button } from "@faridalms/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { calendarEventQuery } from "~/queries/calendar";
import { saveCalendarEvent } from "~/server/calendar";
import { formatDate, formatDayRange } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { CalendarEvent } from "./views";

import { eventTitle } from "./format";

export interface Change {
  move?: number;
  extend?: number;
}

type Loaded = Awaited<
  ReturnType<NonNullable<ReturnType<typeof calendarEventQuery>["queryFn"]>>
>;

interface Asking {
  event: Loaded;
  days: { startsOn: string; endsOn: string };
}

const span = (days: { startsOn: string; endsOn: string }) =>
  days.startsOn === days.endsOn
    ? formatDate(days.startsOn, "weekday")
    : formatDayRange(days.startsOn, days.endsOn);

/**
 * Moving or lengthening an event from the grid. It saves through the same
 * `calendar.save` the editor uses, resubmitting the event as it is stored
 * with new days and the version it was read at; a published one first asks,
 * as the editor does, whether to tell the people it reaches.
 */
export function useReschedule() {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<Asking | null>(null);
  const [tell, setTell] = useState(true);
  const [pending, setPending] = useState(false);
  const [announced, setAnnounced] = useState("");

  const save = async (
    event: Loaded,
    days: { startsOn: string; endsOn: string },
    sendUpdate: boolean,
  ) => {
    setPending(true);
    try {
      await saveCalendarEvent({
        data: {
          id: event.id,
          expectedVersion: event.version,
          titleEn: event.titleEn ?? "",
          titleAr: event.titleAr ?? "",
          category: event.category,
          startsOn: days.startsOn,
          endsOn: days.endsOn,
          allDay: event.startTime === null,
          startTime: event.startTime ?? "",
          endTime: event.endTime ?? "",
          location: event.location ?? "",
          provisional: event.provisional,
          audiences: event.audiences.map((row) => ({
            scope: row.scope,
            classId: row.classId ?? "",
            targetId: row.targetId ?? "",
          })),
          description: event.description ?? emptyContent(),
          sendUpdate,
          public: event.public,
        },
      });
      const said = m.calMoved({ title: eventTitle(event), when: span(days) });
      setAnnounced(said);
      toast.success(said);
      setAsking(null);
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setPending(false);
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
    }
  };

  const reschedule = async (event: CalendarEvent, change: Change) => {
    let loaded: Loaded;
    try {
      loaded = await queryClient.fetchQuery({
        ...calendarEventQuery(event.id),
        staleTime: 0,
      });
    } catch (error) {
      toast.error(getMessageFromError(error));
      return;
    }
    if (!loaded.canEdit) return;
    // The change applies to the event as stored, whatever the grid last drew.
    const days = rescheduled(loaded, change);
    if (!days) {
      toast.error(m.calEndsBefore());
      return;
    }
    if (days.startsOn === loaded.startsOn && days.endsOn === loaded.endsOn)
      return;
    if (loaded.state === "published") {
      setTell(true);
      setAsking({ event: loaded, days });
      return;
    }
    await save(loaded, days, false);
  };

  const dialog = (
    <>
      <p className="sr-only" aria-live="polite">
        {announced}
      </p>
      <Dialog
        open={asking !== null}
        onOpenChange={(open) => !open && !pending && setAsking(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.calMoveTitle()}</DialogTitle>
            <DialogDescription>
              {asking
                ? m.calMoveBody({
                    title: eventTitle(asking.event),
                    when: span(asking.days),
                  })
                : null}
            </DialogDescription>
          </DialogHeader>
          <CheckboxRow
            label={m.calTellChange({ count: asking?.event.reached ?? 0 })}
            hint={m.calTellChangeHint()}
            checked={tell}
            onChange={setTell}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setAsking(null)}
            >
              {m.commonCancel()}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                asking && void save(asking.event, asking.days, tell)
              }
            >
              {m.calMove()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { reschedule, dialog };
}
