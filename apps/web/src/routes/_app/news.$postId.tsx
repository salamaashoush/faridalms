import type { ContentLocale } from "@faridalms/domain/translations";

import { otherLocale } from "@faridalms/domain/translations";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Archive, Copy, Pencil, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { Column } from "~/components/system/DataTable";
import type { HeaderFact } from "~/components/system/RecordPage";

import { audienceLabel } from "~/components/announcements/format";
import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import { shownIn, TranslatedView } from "~/components/content/TranslatedView";
import { usePrint } from "~/components/print/usePrint";
import { DataTable } from "~/components/system/DataTable";
import {
  ReaderWidthToggle,
  useReaderWidth,
} from "~/components/system/ReaderWidth";
import {
  Fact,
  Facts,
  phoneLink,
  RecordHeader,
} from "~/components/system/RecordPage";
import { SheetPanel } from "~/components/system/SheetPanel";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { newsPostQuery } from "~/queries/news";
import {
  archiveNews,
  duplicateNews,
  markNewsSeen,
  publishNews,
} from "~/server/news";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

export const Route = createFileRoute("/_app/news/$postId")({
  staticData: { trail: <NewsTrail />, section: "/news" },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(newsPostQuery(params.postId)),
  component: NewsPostPage,
});

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof newsPostQuery>["queryFn"]>>
>;
type ReportRow = NonNullable<Data["report"]>[number] & { id: string };

const titleOf = (data: { titleEn: string; titleAr: string }) =>
  inLocale(data.titleEn || null, data.titleAr || null);

function NewsTrail() {
  const { postId } = Route.useParams();
  const data = useSuspenseQuery(newsPostQuery(postId)).data;
  return <BreadcrumbCurrent>{titleOf(data)}</BreadcrumbCurrent>;
}

function Read({ row }: { row: ReportRow }) {
  return row.readAt ? (
    <StatusText tone="success">{formatInstant(row.readAt)}</StatusText>
  ) : (
    <StatusText tone="neutral">{m.annNotRead()}</StatusText>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function reportColumns(): Column<ReportRow>[] {
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
  ];
}

function reportCard() {
  return {
    title: (row: ReportRow) => (
      <bdi>{inLocale(row.fullNameEn, row.fullNameAr)}</bdi>
    ),
    status: (row: ReportRow) => <Read row={row} />,
  };
}

function Report({
  data,
  open,
  onOpenChange,
}: {
  data: Data;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rows: ReportRow[] = (data.report ?? []).map((row) => ({
    ...row,
    id: row.userId,
  }));
  const read = rows.filter((row) => row.readAt).length;
  return (
    <SheetPanel
      open={open}
      onOpenChange={onOpenChange}
      title={m.annReport()}
      description={m.newsReportHint()}
    >
      <Facts short>
        <Fact label={m.annReached()}>{formatNumber(rows.length)}</Fact>
        <Fact label={m.annColRead()}>{formatNumber(read)}</Fact>
      </Facts>
      <DataTable
        caption={m.annReport()}
        rows={rows}
        columns={reportColumns()}
        rowLabel={(row) => inLocale(row.fullNameEn, row.fullNameAr)}
        card={reportCard()}
        empty={{ title: m.newsNotSent() }}
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

function NewsPostPage() {
  const { postId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(newsPostQuery(postId)).data;
  const viewer: ContentLocale = getLocale() === "ar" ? "ar" : "en";
  const [locale, setLocale] = useState<ContentLocale>(
    data.translation && viewer === otherLocale(data.primaryLocale)
      ? viewer
      : data.primaryLocale,
  );
  const scheduled = data.shown === "scheduled";
  const [reporting, setReporting] = useState(false);
  const width = useReaderWidth();
  const title =
    (locale === "ar" ? data.titleAr : data.titleEn) || titleOf(data);
  const printing = usePrint({
    title,
    content: shownIn({
      body: data.body,
      translation: data.translation,
      primary: data.primaryLocale,
      locale,
    }),
    link: `/news/${data.id}`,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["news"] });
  const { mutate: markSeen } = useMutation({
    mutationFn: () => markNewsSeen({ data: { id: postId } }),
    onSuccess: refresh,
  });
  const unread = !data.canManage && data.readAt === null;
  useEffect(() => {
    if (unread) markSeen();
  }, [unread, markSeen]);
  const republish = useMutation({
    mutationFn: () =>
      publishNews({
        data: { id: data.id, expectedVersion: data.version },
      }),
  });
  const archive = useMutation({
    mutationFn: () =>
      archiveNews({
        data: { id: data.id, expectedVersion: data.version },
      }),
  });
  const duplicate = useMutation({
    mutationFn: () => duplicateNews({ data: { id: data.id } }),
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
  const copy = async () => {
    try {
      const created = await duplicate.mutateAsync();
      await refresh();
      toast.success(m.newsDuplicated());
      void navigate({ to: "/news-editor", search: { id: created.id } });
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };
  const facts: HeaderFact[] = [
    {
      label: m.annAuthor(),
      value: inLocale(data.authorNameEn, data.authorNameAr),
    },
    ...(data.publishedAt
      ? [
          {
            label: scheduled ? m.newsGoesOut() : m.annSent(),
            value: formatInstant(data.publishedAt),
          },
        ]
      : []),
    ...(data.visibility === "public"
      ? [{ label: m.newsWhere(), value: m.newsWherePublic() }]
      : []),
    ...(data.canManage && data.audiences.length > 0
      ? [
          {
            label: m.annAudience(),
            value: new Intl.ListFormat(getLocale(), {
              type: "conjunction",
            }).format(data.audiences.map(audienceLabel)),
          },
        ]
      : []),
    ...(data.canManage && data.report && !data.preview
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
                  count: formatNumber(
                    data.report.filter((row) => row.readAt).length,
                  ),
                  total: formatNumber(data.report.length),
                })}
              </button>
            ),
          },
        ]
      : []),
  ];
  const editable = data.canManage && data.state !== "archived";
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
          data.state === "draft"
            ? { label: m.newsStateDraft(), tone: "neutral" }
            : scheduled
              ? { label: m.newsStateScheduled(), tone: "info" }
              : data.state === "archived"
                ? { label: m.newsStateArchived(), tone: "neutral" }
                : undefined
        }
        action={
          editable
            ? {
                label: m.annEdit(),
                icon: Pencil,
                onClick: () =>
                  void navigate({
                    to: "/news-editor",
                    search: { id: data.id },
                  }),
              }
            : undefined
        }
        menu={[
          ...(printing.action ? [printing.action] : []),
          ...(data.canManage
            ? [
                {
                  label: m.newsDuplicate(),
                  icon: Copy,
                  onSelect: () => void copy(),
                },
                ...(editable
                  ? [
                      {
                        label: m.annArchive(),
                        icon: Archive,
                        onSelect: () =>
                          void run(
                            () => archive.mutateAsync(),
                            m.newsArchived(),
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
          {m.annUpdatedOn({
            date: formatInstant(data.updatedAt),
          })}
        </p>
      ) : null}
      {data.canManage && data.preview ? (
        <Notice>{m.newsPreviewNotice()}</Notice>
      ) : null}
      {editable && data.changedSince && data.state === "published" ? (
        <Notice
          action={{
            label: m.newsPublishChanges(),
            pending: republish.isPending,
            onClick: () =>
              void run(() => republish.mutateAsync(), m.newsChangesPublished()),
          }}
        >
          {m.newsChangesWaiting()}
        </Notice>
      ) : null}
      <TranslatedView
        body={data.body}
        translation={data.translation}
        primary={data.primaryLocale}
        locale={locale}
        onLocaleChange={setLocale}
      />
      {data.canManage && !data.preview ? (
        <Report data={data} open={reporting} onOpenChange={setReporting} />
      ) : null}
      {printing.sheet}
    </div>
  );
}
