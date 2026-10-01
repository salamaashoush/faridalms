import type { ReactNode } from "react";

import { eventIcs } from "@faridalms/domain/calendar";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { Button } from "@faridalms/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Ban,
  CalendarPlus,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { ActionItem } from "~/components/system/ActionMenu";

import { audienceLabel } from "~/components/announcements/format";
import { ContentView } from "~/components/content/ContentView";
import { ActionMenu } from "~/components/system/ActionMenu";
import { SheetPanel } from "~/components/system/SheetPanel";
import { StatusBadge } from "~/components/system/status";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { calendarEventQuery } from "~/queries/calendar";
import {
  cancelCalendarEvent,
  publishCalendarEvent,
  removeCalendarEvent,
} from "~/server/calendar";
import { formatList, secondaryDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { CATEGORY_LABEL, eventTitle, whenLabel } from "./format";
import { CategoryIcon } from "./views";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof calendarEventQuery>["queryFn"]>>
>;

function download(data: Data, timeZone: string) {
  const title = eventTitle(data);
  const file = eventIcs(
    {
      ...data,
      title,
      description: data.description ? contentPlainText(data.description) : "",
    },
    { timeZone, stamp: new Date() },
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([file], { type: "text/calendar" }));
  link.download = `${title.replaceAll(/[^\p{L}\p{N}]+/gu, "-") || "event"}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[13px] leading-5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm leading-5 break-words">{children}</dd>
    </>
  );
}

function useEventActions(data: Data, onClose: () => void) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
  const draft = data.state === "draft";
  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      await refresh();
      toast.success(done);
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };
  const publish = async (notify: boolean) => {
    try {
      const result = await publishCalendarEvent({
        data: { id: data.id, expectedVersion: data.version, notify },
      });
      await refresh();
      toast.success(
        notify ? m.calPublishedTold({ count: result.told }) : m.calPublished(),
      );
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };
  const addToCalendar: ActionItem = {
    label: m.calAddToCalendar(),
    icon: CalendarPlus,
    onSelect: () => download(data, user.school.timeZone),
  };
  const remove: ActionItem = {
    label: m.calDelete(),
    icon: Trash2,
    destructive: true,
    confirm: {
      title: m.calDeleteTitle(),
      body: m.calDeleteBody(),
      label: m.calDelete(),
    },
    onSelect: async () => {
      await removeCalendarEvent({
        data: { id: data.id, expectedVersion: data.version },
      });
      await refresh();
      toast.success(m.calDeleted());
      onClose();
    },
  };
  const cancelOrRestore: ActionItem = data.cancelled
    ? {
        label: m.calRestore(),
        icon: RotateCcw,
        onSelect: () =>
          run(
            () =>
              cancelCalendarEvent({
                data: {
                  id: data.id,
                  expectedVersion: data.version,
                  cancelled: false,
                },
              }),
            m.calRestored(),
          ),
      }
    : {
        label: m.calCancel(),
        icon: Ban,
        confirm: {
          title: m.calCancelTitle(),
          body: draft
            ? m.calCancelBody()
            : m.calCancelBodyTell({ count: data.reached }),
          label: m.calCancel(),
        },
        onSelect: () =>
          run(
            () =>
              cancelCalendarEvent({
                data: {
                  id: data.id,
                  expectedVersion: data.version,
                  cancelled: true,
                },
              }),
            m.calCancelledToast(),
          ),
      };
  const upcoming = data.endsOn >= user.today;
  const menu: ActionItem[] = !data.canEdit
    ? []
    : draft
      ? [
          addToCalendar,
          {
            label: m.calPublishQuietly(),
            icon: Send,
            onSelect: () => publish(false),
          },
          remove,
        ]
      : [cancelOrRestore, ...(upcoming && !data.cancelled ? [] : [remove])];
  return { publish, addToCalendar, menu };
}

function EventFooter({ data, onClose }: { data: Data; onClose: () => void }) {
  const navigate = useNavigate();
  const { publish, addToCalendar, menu } = useEventActions(data, onClose);
  const draft = data.state === "draft";
  const add = (
    <Button
      type="button"
      variant="outline"
      className="max-md:h-10"
      onClick={() => void addToCalendar.onSelect()}
    >
      <CalendarPlus aria-hidden />
      {addToCalendar.label}
    </Button>
  );
  if (!data.canEdit) return add;
  return (
    <>
      {draft ? (
        <Button
          type="button"
          className="max-md:h-10"
          onClick={() => void publish(true)}
        >
          <Send aria-hidden />
          {m.calPublishTell({ count: data.reached })}
        </Button>
      ) : null}
      <Button
        type="button"
        variant={draft ? "outline" : "default"}
        className="max-md:h-10"
        onClick={() =>
          void navigate({ to: "/event-editor", search: { id: data.id } })
        }
      >
        <Pencil aria-hidden />
        {m.annEdit()}
      </Button>
      {draft ? null : add}
      <ActionMenu label={m.docMoreActions()} actions={menu} />
    </>
  );
}

function EventContext({ data }: { data: Data }) {
  return (
    <>
      <span className="inline-flex items-center gap-1.5 text-[13px] leading-5 text-muted-foreground">
        <CategoryIcon category={data.category} className="size-4" />
        {CATEGORY_LABEL[data.category]()}
      </span>
      {data.state === "draft" ? (
        <StatusBadge tone="neutral">{m.calDraft()}</StatusBadge>
      ) : data.cancelled ? (
        <StatusBadge tone="danger">{m.calCancelled()}</StatusBadge>
      ) : data.provisional ? (
        <StatusBadge tone="warning">{m.calProvisional()}</StatusBadge>
      ) : null}
    </>
  );
}

function EventBody({ data }: { data: Data }) {
  const user = useCurrentUser();
  const secondary = secondaryDate(
    data.startsOn,
    user.school.secondaryCalendar,
    { day: "numeric", month: "long", year: "numeric" },
  );
  const described =
    data.description &&
    (contentPlainText(data.description).trim() ||
      contentFileIds(data.description).length > 0);
  return (
    <>
      <p className="-mt-4 text-[15px] leading-6">
        <span className={data.cancelled ? "line-through" : undefined}>
          {whenLabel(data)}
        </span>
        {secondary ? (
          <span className="block text-sm leading-5 text-muted-foreground">
            {secondary}
          </span>
        ) : null}
      </p>
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-3">
        {data.location ? (
          <Property label={m.calWhere()}>
            <bdi>{data.location}</bdi>
          </Property>
        ) : null}
        {data.canEdit && data.audiences.length > 0 ? (
          <Property label={m.calFor()}>
            {formatList(data.audiences.map(audienceLabel))}
          </Property>
        ) : null}
        <Property label={m.calAddedByLabel()}>
          {inLocale(data.authorNameEn, data.authorNameAr)}
        </Property>
      </dl>
      {data.state === "draft" && data.canEdit ? (
        <p className="rounded-md bg-muted px-3 py-2 text-[13px] leading-[18px] text-muted-foreground">
          {m.calDraftNote()}
        </p>
      ) : null}
      {described && data.description ? (
        <div className="border-t pt-6">
          <ContentView
            document={data.description}
            fileUrl={(fileId) => `/files/${fileId}`}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * An event opened over the calendar it belongs to, so reading one never
 * loses the month behind it. Its address can be shared and reopens here.
 */
export function EventSheet({
  eventId,
  onClose,
}: {
  eventId: string | null;
  onClose: () => void;
}) {
  // The last event shown stays while the panel slides shut.
  const [shown, setShown] = useState(eventId);
  if (eventId !== null && eventId !== shown) setShown(eventId);
  const query = useQuery({
    ...calendarEventQuery(shown ?? ""),
    enabled: shown !== null,
  });
  const data = shown && query.data?.id === shown ? query.data : null;
  return (
    <SheetPanel
      open={eventId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={data ? eventTitle(data) : m.calTitle()}
      context={data ? <EventContext data={data} /> : <span />}
      footer={data ? <EventFooter data={data} onClose={onClose} /> : undefined}
    >
      {data ? (
        <EventBody data={data} />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getMessageFromError(query.error)}
        </p>
      ) : (
        <div aria-busy="true" className="min-h-40" />
      )}
    </SheetPanel>
  );
}
