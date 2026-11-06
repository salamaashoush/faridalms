import type { ContentLocale } from "@faridalms/domain/translations";
import type { Column } from "@faridalms/ui/system/data-table";
import type { HeaderFact } from "@faridalms/ui/system/record-page";

import { otherLocale } from "@faridalms/domain/translations";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import { BreadcrumbCurrent } from "@faridalms/ui/system/app-shell";
import { DataTable } from "@faridalms/ui/system/data-table";
import {
  Fact,
  Facts,
  phoneLink,
  RecordHeader,
} from "@faridalms/ui/system/record-page";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { StatusText } from "@faridalms/ui/system/status";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Archive, CircleCheck, Copy, Pencil, Search, Send } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";

import { shownIn, TranslatedView } from "~/components/content/TranslatedView";
import { usePrint } from "~/components/print/usePrint";
import {
  ReaderWidthToggle,
  useReaderWidth,
} from "~/components/system/ReaderWidth";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { formatDate, formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { BroadcastKind, KindView, RecordData } from "./kinds";

import {
  audienceLabel,
  STATE_LABEL,
  STATE_TONE,
  URGENCY_LABEL,
  URGENCY_TONE,
} from "./format";
import { KINDS } from "./kinds";

type ReportRow = Awaited<
  ReturnType<NonNullable<ReturnType<KindView["reportQuery"]>["queryFn"]>>
>["rows"][number] & { id: string };

const titleOf = (data: { titleEn: string; titleAr: string }) =>
  inLocale(data.titleEn || null, data.titleAr || null);

/** A broadcast's title in the reader's language, for its breadcrumb. */
export function BroadcastTrail({
  kind,
  id,
}: {
  kind: BroadcastKind;
  id: string;
}) {
  return (
    <BreadcrumbCurrent>{titleOf(KINDS[kind].useRecord(id))}</BreadcrumbCurrent>
  );
}

function Read({ row }: { row: ReportRow }) {
  return row.readAt ? (
    <StatusText tone="success">{formatInstant(row.readAt)}</StatusText>
  ) : (
    <StatusText tone="neutral">{m.annNotRead()}</StatusText>
  );
}

function Acknowledged({ row }: { row: ReportRow }) {
  return row.acknowledgedAt ? (
    <StatusText tone="success">{formatInstant(row.acknowledgedAt)}</StatusText>
  ) : (
    <StatusText tone="warning">{m.annNotAcknowledged()}</StatusText>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function reportColumns(withAck: boolean): Column<ReportRow>[] {
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
      cell: (row) => <Read row={row} />,
    },
    ...(withAck
      ? [
          {
            id: "ack",
            header: m.annColAcknowledged(),
            cell: (row: ReportRow) => <Acknowledged row={row} />,
          },
        ]
      : []),
  ];
}

function reportCard(withAck: boolean) {
  return {
    title: (row: ReportRow) => (
      <bdi>{inLocale(row.fullNameEn, row.fullNameAr)}</bdi>
    ),
    status: (row: ReportRow) =>
      withAck ? <Acknowledged row={row} /> : <Read row={row} />,
  };
}

function Report({
  view,
  data,
  open,
  onOpenChange,
}: {
  view: KindView;
  data: RecordData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const report = useQuery({
    ...view.reportQuery({ id: data.id, q, page }),
    enabled: open,
  }).data;
  const rows: ReportRow[] = (report?.rows ?? []).map((row) => ({
    ...row,
    id: row.userId,
  }));
  const counts = data.report ?? { recipients: 0, read: 0, acknowledged: 0 };
  return (
    <SheetPanel
      open={open}
      onOpenChange={onOpenChange}
      title={m.annReport()}
      description={view.copy.reportHint()}
    >
      <Facts short>
        <Fact label={m.annReached()}>{formatNumber(counts.recipients)}</Fact>
        <Fact label={m.annColRead()}>{formatNumber(counts.read)}</Fact>
        {data.requiresAck ? (
          <Fact label={m.annColAcknowledged()}>
            {formatNumber(counts.acknowledged)}
          </Fact>
        ) : null}
      </Facts>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          dir="auto"
          value={search}
          aria-label={m.annReportSearch()}
          placeholder={m.annReportSearch()}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="ps-8 max-md:h-10"
        />
      </div>
      <DataTable
        caption={m.annReport()}
        rows={rows}
        columns={reportColumns(data.requiresAck)}
        rowLabel={(row) => inLocale(row.fullNameEn, row.fullNameAr)}
        card={reportCard(data.requiresAck)}
        pagination={
          report && report.pages > 1
            ? {
                page: report.page,
                pages: report.pages,
                total: report.total,
                pageSize: report.pageSize,
                onPage: setPage,
              }
            : undefined
        }
        empty={{ title: q ? m.annReportNoMatch() : view.copy.notSent() }}
      />
    </SheetPanel>
  );
}

function Notice({
  children,
  action,
}: {
  children: string;
  action?: { label: string; onClick: () => void; pending: boolean };
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/60 bg-warning/10 px-4 py-3">
      <p className="min-w-0 flex-1 text-sm leading-5">{children}</p>
      {action ? (
        <Button
          type="button"
          className="max-md:h-10"
          disabled={action.pending}
          onClick={action.onClick}
        >
          <Send aria-hidden />
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One broadcast as its reader sees it: the copy that went out, in the
 * reader's language where it has one. Those who manage the kind also see who
 * it reached, edits still waiting, and a draft never sent as a preview.
 */
export function BroadcastRecord({
  kind,
  id,
}: {
  kind: BroadcastKind;
  id: string;
}) {
  const view = KINDS[kind];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const data = view.useRecord(id);
  const viewer: ContentLocale = getLocale() === "ar" ? "ar" : "en";
  const [locale, setLocale] = useState<ContentLocale>(
    data.translation && viewer === otherLocale(data.primaryLocale)
      ? viewer
      : data.primaryLocale,
  );
  const [reporting, setReporting] = useState(false);
  const width = useReaderWidth();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: [view.queryKey] });
  const { mutate: markSeen } = useMutation({
    mutationFn: () => view.seen(id, false),
    onSuccess: refresh,
  });
  const unread = !data.canManage && data.readAt === null;
  useEffect(() => {
    if (unread) markSeen();
  }, [unread, markSeen]);
  const acknowledge = useMutation({ mutationFn: () => view.seen(id, true) });
  const revise = useMutation({
    mutationFn: () =>
      view.publish({
        id: data.id,
        expectedVersion: data.version,
        publishAt: "",
        revision: "telling",
      }),
  });
  const archive = useMutation({
    mutationFn: () => view.archive(data.id, data.version),
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
  const openEditor = (editing: string) =>
    void (kind === "announcement"
      ? navigate({ to: "/admin/announcement-editor", search: { id: editing } })
      : navigate({ to: "/news-editor", search: { id: editing } }));
  const copy = async () => {
    try {
      const created = await view.duplicate(data.id);
      await refresh();
      toast.success(view.copy.duplicated());
      openEditor(created.id);
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };
  const title =
    (locale === "ar" ? data.titleAr : data.titleEn) || titleOf(data);
  const shownLocale = data.translation ? locale : data.primaryLocale;
  const printing = usePrint({
    title,
    content: shownIn({
      body: data.body,
      translation: data.translation,
      primary: data.primaryLocale,
      locale: shownLocale,
    }),
    link: view.recordPath(data.id),
  });
  const scheduled = data.shown === "scheduled";
  const reported = data.canManage && data.report && !data.preview;
  const facts: HeaderFact[] = [
    {
      label: m.annAuthor(),
      value: inLocale(data.authorNameEn, data.authorNameAr),
    },
    ...(data.publishAt
      ? [
          {
            label: scheduled ? m.newsGoesOut() : m.annSent(),
            value: formatInstant(data.publishAt),
          },
        ]
      : []),
    ...(data.visibility === "public"
      ? [{ label: m.newsWhere(), value: m.newsWherePublic() }]
      : []),
    ...(data.audiences.length > 0 && (kind === "announcement" || data.canManage)
      ? [
          {
            label: m.annAudience(),
            value: new Intl.ListFormat(getLocale(), {
              type: "conjunction",
            }).format(data.audiences.map(audienceLabel)),
          },
        ]
      : []),
    ...(reported
      ? [
          {
            label: m.annReport(),
            value: (
              <button
                type="button"
                className={cn(
                  "font-medium text-primary underline-offset-4 hover:underline",
                  phoneLink,
                )}
                onClick={() => setReporting(true)}
              >
                {m.annReadOf({
                  count: formatNumber(data.report?.read ?? 0),
                  total: formatNumber(data.report?.recipients ?? 0),
                })}
              </button>
            ),
          },
        ]
      : []),
  ];
  const editable = data.canManage && data.shown !== "archived";
  const out = data.shown === "published";
  return (
    <div
      className={cn(
        "mx-auto grid w-full gap-6",
        width.wide ? "max-w-none" : "max-w-[720px]",
      )}
    >
      <RecordHeader
        variant="document"
        title={title}
        facts={facts}
        tools={<ReaderWidthToggle wide={width.wide} onToggle={width.toggle} />}
        status={
          !out
            ? { label: STATE_LABEL[data.shown](), tone: STATE_TONE[data.shown] }
            : data.urgency === "normal"
              ? undefined
              : {
                  label: URGENCY_LABEL[data.urgency](),
                  tone: URGENCY_TONE[data.urgency],
                }
        }
        action={
          editable
            ? {
                label: m.annEdit(),
                icon: Pencil,
                onClick: () => openEditor(data.id),
              }
            : undefined
        }
        menu={[
          ...(printing.action ? [printing.action] : []),
          ...(data.canManage
            ? [
                {
                  label: view.copy.duplicate(),
                  icon: Copy,
                  onSelect: () => void copy(),
                },
                ...(kind === "announcement" && out
                  ? [
                      {
                        label: view.copy.revise(),
                        icon: Send,
                        onSelect: () =>
                          void run(
                            () => revise.mutateAsync(),
                            view.copy.revised(),
                          ),
                      },
                    ]
                  : []),
                ...(editable
                  ? [
                      {
                        label: m.annArchive(),
                        icon: Archive,
                        onSelect: () =>
                          void run(
                            () => archive.mutateAsync(),
                            view.copy.archived(),
                          ),
                      },
                    ]
                  : []),
              ]
            : []),
        ]}
      />
      {data.updatedAt ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.annUpdatedOn({ date: formatInstant(data.updatedAt) })}
        </p>
      ) : null}
      {data.canManage && data.preview ? (
        <Notice>{m.bcastPreviewNotice()}</Notice>
      ) : null}
      {editable && data.changedSince && out ? (
        <Notice
          action={{
            label: view.copy.revise(),
            pending: revise.isPending,
            onClick: () =>
              void run(() => revise.mutateAsync(), view.copy.revised()),
          }}
        >
          {m.bcastEditsWaiting()}
        </Notice>
      ) : null}
      <TranslatedView
        body={data.body}
        translation={data.translation}
        primary={data.primaryLocale}
        locale={shownLocale}
        onLocaleChange={setLocale}
      />
      {data.requiresAck && !data.canManage ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 px-5 py-4">
          {data.acknowledgedAt ? (
            <StatusText tone="success">
              {m.annAcknowledgedOn({
                date: formatInstant(data.acknowledgedAt),
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
      {reported ? (
        <Report
          view={view}
          data={data}
          open={reporting}
          onOpenChange={setReporting}
        />
      ) : null}
      {printing.sheet}
    </div>
  );
}
