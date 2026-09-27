import { eventIcs } from "@faridalms/domain/calendar";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Ban,
  CalendarPlus,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import type { HeaderFact } from "~/components/system/RecordPage";

import { audienceLabel } from "~/components/announcements/format";
import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import { CATEGORY_LABEL, whenLabel } from "~/components/calendar/format";
import { ContentView } from "~/components/content/ContentView";
import { RecordHeader } from "~/components/system/RecordPage";
import { Button } from "~/components/ui/button";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { calendarEventQuery } from "~/queries/calendar";
import {
  cancelCalendarEvent,
  publishCalendarEvent,
  removeCalendarEvent,
} from "~/server/calendar";
import { formatList } from "~/utils/datetime";

export const Route = createFileRoute("/_app/calendar/$eventId")({
  staticData: { trail: <EventTrail />, section: "/calendar" },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(calendarEventQuery(params.eventId)),
  component: EventPage,
});

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof calendarEventQuery>["queryFn"]>>
>;

function EventTrail() {
  const { eventId } = Route.useParams();
  const data = useSuspenseQuery(calendarEventQuery(eventId)).data;
  return <BreadcrumbCurrent>{data.title}</BreadcrumbCurrent>;
}

function download(data: Data, timeZone: string) {
  const file = eventIcs(
    {
      ...data,
      description: data.description ? contentPlainText(data.description) : "",
    },
    { timeZone, stamp: new Date() },
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([file], { type: "text/calendar" }));
  link.download = `${data.title.replaceAll(/[^\p{L}\p{N}]+/gu, "-") || "event"}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function EventPage() {
  const { eventId } = Route.useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(calendarEventQuery(eventId)).data;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
  const draft = data.state === "draft";
  const upcoming = data.endsOn >= user.today;
  const facts: HeaderFact[] = [
    { label: m.calWhen(), value: whenLabel(data) },
    ...(data.location ? [{ label: m.calWhere(), value: data.location }] : []),
    { label: m.calCategory(), value: CATEGORY_LABEL[data.category]() },
    ...(data.canEdit && data.audiences.length > 0
      ? [
          {
            label: m.calFor(),
            value: formatList(data.audiences.map(audienceLabel)),
          },
        ]
      : []),
  ];
  const edit = {
    label: m.annEdit(),
    icon: Pencil,
    onSelect: () =>
      void navigate({ to: "/event-editor", search: { id: data.id } }),
  };
  const publish = async (notify: boolean) => {
    const result = await publishCalendarEvent({
      data: { id: data.id, expectedVersion: data.version, notify },
    });
    await refresh();
    toast.success(
      notify ? m.calPublishedTold({ count: result.told }) : m.calPublished(),
    );
  };
  const remove = {
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
      await navigate({ to: "/calendar", search: {} });
    },
  };
  const cancelOrRestore = data.cancelled
    ? {
        label: m.calRestore(),
        icon: RotateCcw,
        onSelect: async () => {
          await cancelCalendarEvent({
            data: {
              id: data.id,
              expectedVersion: data.version,
              cancelled: false,
            },
          });
          await refresh();
          toast.success(m.calRestored());
        },
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
        onSelect: async () => {
          await cancelCalendarEvent({
            data: {
              id: data.id,
              expectedVersion: data.version,
              cancelled: true,
            },
          });
          await refresh();
          toast.success(m.calCancelledToast());
        },
      };
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <RecordHeader
        title={data.title}
        facts={facts}
        status={
          draft
            ? { label: m.calDraft(), tone: "neutral" }
            : data.cancelled
              ? { label: m.calCancelled(), tone: "danger" }
              : data.provisional
                ? { label: m.calProvisional(), tone: "warning" }
                : undefined
        }
        action={
          !data.canEdit
            ? undefined
            : draft
              ? {
                  label: m.calPublishTell({ count: data.reached }),
                  icon: Send,
                  onClick: () => void publish(true),
                }
              : { label: edit.label, icon: Pencil, onClick: edit.onSelect }
        }
        menu={
          !data.canEdit
            ? []
            : draft
              ? [
                  edit,
                  {
                    label: m.calPublishQuietly(),
                    icon: Send,
                    onSelect: () => publish(false),
                  },
                  remove,
                ]
              : [
                  cancelOrRestore,
                  ...(upcoming && !data.cancelled ? [] : [remove]),
                ]
        }
      />
      {draft && data.canEdit ? (
        <p className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {m.calDraftNote()}
        </p>
      ) : null}
      <div>
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={() => download(data, user.school.timeZone)}
        >
          <CalendarPlus aria-hidden />
          {m.calAddToCalendar()}
        </Button>
      </div>
      {data.description &&
      (contentPlainText(data.description).trim() ||
        contentFileIds(data.description).length > 0) ? (
        <article className="rounded-lg border bg-card p-5 sm:p-8">
          <ContentView
            document={data.description}
            fileUrl={(fileId) => `/files/${fileId}`}
          />
        </article>
      ) : null}
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.calAddedBy({
          name: inLocale(data.authorNameEn, data.authorNameAr),
        })}
      </p>
    </div>
  );
}
