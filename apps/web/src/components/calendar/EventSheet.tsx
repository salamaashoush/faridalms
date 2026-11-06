import type { ContentLocale } from "@faridalms/domain/translations";
import type { ActionItem } from "@faridalms/ui/system/action-menu";
import type { ReactNode } from "react";

import { eventIcs } from "@faridalms/domain/calendar";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { otherLocale } from "@faridalms/domain/translations";
import { Button } from "@faridalms/ui/button";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { StatusBadge } from "@faridalms/ui/system/status";
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

import { audienceLabel } from "~/components/broadcasts/format";
import { TranslatedView } from "~/components/content/TranslatedView";
import { usePrint } from "~/components/print/usePrint";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { calendarEventQuery } from "~/queries/calendar";
import {
  cancelCalendarEvent,
  publishCalendarEvent,
  removeCalendarEvent,
} from "~/server/calendar";
import { formatSpan, formatList, secondaryDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { CATEGORY_LABEL, eventTitle } from "./format";
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

interface PropertyProps {
  label: string;
  children: ReactNode;
}

function Property({ label, children }: PropertyProps) {
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

interface EventFooterProps {
  data: Data;
  onClose: () => void;
}

function EventFooter({ data, onClose }: EventFooterProps) {
  const navigate = useNavigate();
  const { publish, addToCalendar, menu } = useEventActions(data, onClose);
  const printing = usePrint({
    title: eventTitle(data),
    facts: (locale) =>
      [formatSpan(data, "long", locale), data.location].filter(
        (fact) => fact !== null,
      ),
    content: data.description ?? emptyContent(),
    link: `/calendar/${data.id}`,
  });
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
  if (!data.canEdit)
    return (
      <>
        {add}
        {printing.action ? (
          <ActionMenu label={m.docMoreActions()} actions={[printing.action]} />
        ) : null}
        {printing.sheet}
      </>
    );
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
      <ActionMenu
        label={m.docMoreActions()}
        actions={[...(printing.action ? [printing.action] : []), ...menu]}
      />
      {printing.sheet}
    </>
  );
}

interface EventContextProps {
  data: Data;
}

function EventContext({ data }: EventContextProps) {
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

interface EventBodyProps {
  data: Data;
}

function EventBody({ data }: EventBodyProps) {
  const user = useCurrentUser();
  const viewer: ContentLocale = getLocale() === "ar" ? "ar" : "en";
  const [locale, setLocale] = useState<ContentLocale>(
    data.translation && viewer === otherLocale(data.primaryLocale)
      ? viewer
      : data.primaryLocale,
  );
  const secondary = secondaryDate(
    data.startsOn,
    user.school.secondaryCalendar,
    "full",
  );
  const described =
    data.description &&
    (contentPlainText(data.description).trim() ||
      contentFileIds(data.description).length > 0);
  return (
    <>
      <p className="-mt-4 text-[15px] leading-6">
        <span className={data.cancelled ? "line-through" : undefined}>
          {formatSpan(data)}
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
          <TranslatedView
            body={data.description}
            translation={data.translation}
            primary={data.primaryLocale}
            locale={locale}
            onLocaleChange={setLocale}
          />
        </div>
      ) : null}
    </>
  );
}

export interface EventSheetProps {
  eventId: string | null;
  onClose: () => void;
}

/**
 * An event opened over the calendar it belongs to, so reading one never
 * loses the month behind it. Its address can be shared and reopens here.
 */
export function EventSheet({ eventId, onClose }: EventSheetProps) {
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
