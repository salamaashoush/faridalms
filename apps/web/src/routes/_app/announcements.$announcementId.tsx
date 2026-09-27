import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Archive, CircleCheck, Pencil, Send } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import type { Column } from "~/components/system/DataTable";
import type { HeaderFact } from "~/components/system/RecordPage";

import {
  audienceLabel,
  URGENCY_LABEL,
  URGENCY_TONE,
} from "~/components/announcements/format";
import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import { ContentView } from "~/components/content/ContentView";
import { formatInstant } from "~/components/coursework/format";
import { DataTable } from "~/components/system/DataTable";
import {
  Fact,
  Facts,
  RecordHeader,
  RecordSection,
} from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { Button } from "~/components/ui/button";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { announcementQuery } from "~/queries/announcements";
import {
  archiveAnnouncement,
  markAnnouncementSeen,
  publishAnnouncement,
} from "~/server/announcements";
import { formatDate, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

export const Route = createFileRoute("/_app/announcements/$announcementId")({
  staticData: { trail: <AnnouncementTrail />, section: "/announcements" },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      announcementQuery(params.announcementId),
    ),
  component: AnnouncementPage,
});

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof announcementQuery>["queryFn"]>>
>;
type ReportRow = NonNullable<Data["report"]>[number] & { id: string };

function AnnouncementTrail() {
  const { announcementId } = Route.useParams();
  const data = useSuspenseQuery(announcementQuery(announcementId)).data;
  return <BreadcrumbCurrent>{data.title}</BreadcrumbCurrent>;
}

function Read({ row, timeZone }: { row: ReportRow; timeZone: string }) {
  return row.readAt ? (
    <StatusText tone="success">
      {formatInstant(row.readAt, timeZone)}
    </StatusText>
  ) : (
    <StatusText tone="neutral">{m.annNotRead()}</StatusText>
  );
}

function Acknowledged({ row, timeZone }: { row: ReportRow; timeZone: string }) {
  return row.acknowledgedAt ? (
    <StatusText tone="success">
      {formatInstant(row.acknowledgedAt, timeZone)}
    </StatusText>
  ) : (
    <StatusText tone="warning">{m.annNotAcknowledged()}</StatusText>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function reportColumns(
  timeZone: string,
  withAck: boolean,
): Column<ReportRow>[] {
  return [
    {
      id: "name",
      header: m.annColPerson(),
      primary: true,
      cell: (row) => <bdi>{inLocale(row.fullNameEn, row.fullNameAr)}</bdi>,
    },
    {
      id: "read",
      header: m.annColRead(),
      cell: (row) => <Read row={row} timeZone={timeZone} />,
    },
    ...(withAck
      ? [
          {
            id: "ack",
            header: m.annColAcknowledged(),
            cell: (row: ReportRow) => (
              <Acknowledged row={row} timeZone={timeZone} />
            ),
          },
        ]
      : []),
  ];
}

function reportCard(timeZone: string, withAck: boolean) {
  return {
    title: (row: ReportRow) => (
      <bdi>{inLocale(row.fullNameEn, row.fullNameAr)}</bdi>
    ),
    status: (row: ReportRow) =>
      withAck ? (
        <Acknowledged row={row} timeZone={timeZone} />
      ) : (
        <Read row={row} timeZone={timeZone} />
      ),
  };
}

function Report({ data }: { data: Data }) {
  const user = useCurrentUser();
  const rows: ReportRow[] = (data.report ?? []).map((row) => ({
    ...row,
    id: row.userId,
  }));
  const read = rows.filter((row) => row.readAt).length;
  const acknowledged = rows.filter((row) => row.acknowledgedAt).length;
  return (
    <RecordSection title={m.annReport()} description={m.annReportHint()}>
      <div className="grid gap-4">
        <Facts short>
          <Fact label={m.annReached()}>{formatNumber(rows.length)}</Fact>
          <Fact label={m.annColRead()}>{formatNumber(read)}</Fact>
          {data.requiresAck ? (
            <Fact label={m.annColAcknowledged()}>
              {formatNumber(acknowledged)}
            </Fact>
          ) : null}
        </Facts>
        <DataTable
          caption={m.annReport()}
          rows={rows}
          columns={reportColumns(user.school.timeZone, data.requiresAck)}
          rowLabel={(row) => inLocale(row.fullNameEn, row.fullNameAr)}
          card={reportCard(user.school.timeZone, data.requiresAck)}
          empty={{ title: m.annNotSent() }}
        />
      </div>
    </RecordSection>
  );
}

function AnnouncementPage() {
  const { announcementId } = Route.useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(announcementQuery(announcementId)).data;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["announcements"] });
  const { mutate: markSeen } = useMutation({
    mutationFn: () =>
      markAnnouncementSeen({
        data: { id: announcementId, acknowledge: false },
      }),
    onSuccess: refresh,
  });
  const unread = !data.canManage && data.readAt === null;
  useEffect(() => {
    if (unread) markSeen();
  }, [unread, markSeen]);
  const acknowledge = useMutation({
    mutationFn: () =>
      markAnnouncementSeen({ data: { id: announcementId, acknowledge: true } }),
  });
  const update = useMutation({
    mutationFn: () =>
      publishAnnouncement({
        data: { id: data.id, expectedVersion: data.version, sendUpdate: true },
      }),
  });
  const archive = useMutation({
    mutationFn: () =>
      archiveAnnouncement({
        data: { id: data.id, expectedVersion: data.version },
      }),
  });
  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      await refresh();
      toast.success(done);
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };
  const facts: HeaderFact[] = [
    {
      label: m.annAuthor(),
      value: inLocale(data.authorNameEn, data.authorNameAr),
    },
    ...(data.publishAt
      ? [
          {
            label: m.annSent(),
            value: formatInstant(data.publishAt, user.school.timeZone),
          },
        ]
      : []),
    {
      label: m.annAudience(),
      value: new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(
        data.audiences.map(audienceLabel),
      ),
    },
  ];
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <RecordHeader
        title={data.title}
        facts={facts}
        status={
          data.urgency === "normal"
            ? undefined
            : {
                label: URGENCY_LABEL[data.urgency](),
                tone: URGENCY_TONE[data.urgency],
              }
        }
        action={
          data.canManage && data.state !== "archived"
            ? {
                label: m.annEdit(),
                icon: Pencil,
                onClick: () =>
                  void navigate({
                    to: "/admin/announcement-editor",
                    search: { id: data.id },
                  }),
              }
            : undefined
        }
        menu={
          data.canManage && data.state !== "archived"
            ? [
                ...(data.state === "published"
                  ? [
                      {
                        label: m.annSendUpdate(),
                        icon: Send,
                        onSelect: () =>
                          void run(
                            () => update.mutateAsync(),
                            m.annUpdateSent(),
                          ),
                      },
                    ]
                  : []),
                {
                  label: m.annArchive(),
                  icon: Archive,
                  onSelect: () =>
                    void run(() => archive.mutateAsync(), m.annArchived()),
                },
              ]
            : []
        }
      />
      {data.updateSentAt ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.annUpdatedOn({
            date: formatInstant(data.updateSentAt, user.school.timeZone),
          })}
        </p>
      ) : null}
      <article className="rounded-lg border bg-card p-5 sm:p-8">
        {data.body ? (
          <ContentView
            document={data.body}
            fileUrl={(fileId) => `/files/${fileId}`}
          />
        ) : null}
      </article>
      {data.requiresAck && !data.canManage ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
          {data.acknowledgedAt ? (
            <StatusText tone="success">
              {m.annAcknowledgedOn({
                date: formatInstant(data.acknowledgedAt, user.school.timeZone),
              })}
            </StatusText>
          ) : (
            <>
              <p className="min-w-0 flex-1 text-sm leading-5">
                {data.ackDueOn
                  ? m.annAckDue({ date: formatDate(data.ackDueOn) })
                  : m.annAckNeeded()}
              </p>
              <Button
                type="button"
                className="max-md:h-10"
                disabled={acknowledge.isPending}
                onClick={() =>
                  void run(() => acknowledge.mutateAsync(), m.annThanks())
                }
              >
                <CircleCheck aria-hidden />
                {m.annAcknowledge()}
              </Button>
            </>
          )}
        </div>
      ) : null}
      {data.canManage ? <Report data={data} /> : null}
    </div>
  );
}
