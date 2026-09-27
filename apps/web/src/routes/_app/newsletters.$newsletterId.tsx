import type { NewsletterLocale } from "@faridalms/domain/newsletters";

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
import { formatInstant } from "~/components/coursework/format";
import {
  NewsletterView,
  otherLocale,
} from "~/components/newsletters/NewsletterView";
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
import { newsletterQuery } from "~/queries/newsletters";
import {
  archiveNewsletter,
  duplicateNewsletter,
  markNewsletterSeen,
  publishNewsletter,
} from "~/server/newsletters";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

export const Route = createFileRoute("/_app/newsletters/$newsletterId")({
  staticData: { trail: <NewsletterTrail />, section: "/newsletters" },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(newsletterQuery(params.newsletterId)),
  component: NewsletterPage,
});

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof newsletterQuery>["queryFn"]>>
>;
type ReportRow = NonNullable<Data["report"]>[number] & { id: string };

function NewsletterTrail() {
  const { newsletterId } = Route.useParams();
  const data = useSuspenseQuery(newsletterQuery(newsletterId)).data;
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

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function reportColumns(timeZone: string): Column<ReportRow>[] {
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
  ];
}

function reportCard(timeZone: string) {
  return {
    title: (row: ReportRow) => (
      <bdi>{inLocale(row.fullNameEn, row.fullNameAr)}</bdi>
    ),
    status: (row: ReportRow) => <Read row={row} timeZone={timeZone} />,
  };
}

function Report({ data }: { data: Data }) {
  const user = useCurrentUser();
  const rows: ReportRow[] = (data.report ?? []).map((row) => ({
    ...row,
    id: row.userId,
  }));
  const read = rows.filter((row) => row.readAt).length;
  return (
    <RecordSection title={m.annReport()} description={m.nlReportHint()}>
      <div className="grid gap-4">
        <Facts short>
          <Fact label={m.annReached()}>{formatNumber(rows.length)}</Fact>
          <Fact label={m.annColRead()}>{formatNumber(read)}</Fact>
        </Facts>
        <DataTable
          caption={m.annReport()}
          rows={rows}
          columns={reportColumns(user.school.timeZone)}
          rowLabel={(row) => inLocale(row.fullNameEn, row.fullNameAr)}
          card={reportCard(user.school.timeZone)}
          empty={{ title: m.nlNotSent() }}
        />
      </div>
    </RecordSection>
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

function NewsletterPage() {
  const { newsletterId } = Route.useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(newsletterQuery(newsletterId)).data;
  const viewer: NewsletterLocale = getLocale() === "ar" ? "ar" : "en";
  const [locale, setLocale] = useState<NewsletterLocale>(
    data.translation && viewer === otherLocale(data.primaryLocale)
      ? viewer
      : data.primaryLocale,
  );
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["newsletters"] });
  const { mutate: markSeen } = useMutation({
    mutationFn: () => markNewsletterSeen({ data: { id: newsletterId } }),
    onSuccess: refresh,
  });
  const unread = !data.canManage && data.readAt === null;
  useEffect(() => {
    if (unread) markSeen();
  }, [unread, markSeen]);
  const republish = useMutation({
    mutationFn: () =>
      publishNewsletter({
        data: { id: data.id, expectedVersion: data.version },
      }),
  });
  const archive = useMutation({
    mutationFn: () =>
      archiveNewsletter({
        data: { id: data.id, expectedVersion: data.version },
      }),
  });
  const duplicate = useMutation({
    mutationFn: () => duplicateNewsletter({ data: { id: data.id } }),
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
      toast.success(m.nlDuplicated());
      void navigate({
        to: "/admin/newsletter-editor",
        search: { id: created.id },
      });
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
            label: data.state === "scheduled" ? m.nlGoesOut() : m.annSent(),
            value: formatInstant(data.publishAt, user.school.timeZone),
          },
        ]
      : []),
    ...(data.canManage
      ? [
          {
            label: m.annAudience(),
            value: new Intl.ListFormat(getLocale(), {
              type: "conjunction",
            }).format(data.audiences.map(audienceLabel)),
          },
        ]
      : []),
  ];
  const editable = data.canManage && data.state !== "archived";
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <RecordHeader
        title={data.title}
        facts={facts}
        status={
          data.state === "draft"
            ? { label: m.nlStateDraft(), tone: "neutral" }
            : data.state === "scheduled"
              ? { label: m.nlStateScheduled(), tone: "info" }
              : data.state === "archived"
                ? { label: m.nlStateArchived(), tone: "neutral" }
                : undefined
        }
        action={
          editable
            ? {
                label: m.annEdit(),
                icon: Pencil,
                onClick: () =>
                  void navigate({
                    to: "/admin/newsletter-editor",
                    search: { id: data.id },
                  }),
              }
            : undefined
        }
        menu={
          data.canManage
            ? [
                {
                  label: m.nlDuplicate(),
                  icon: Copy,
                  onSelect: () => void copy(),
                },
                ...(editable
                  ? [
                      {
                        label: m.annArchive(),
                        icon: Archive,
                        onSelect: () =>
                          void run(() => archive.mutateAsync(), m.nlArchived()),
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
      {data.revisedAt ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.annUpdatedOn({
            date: formatInstant(data.revisedAt, user.school.timeZone),
          })}
        </p>
      ) : null}
      {data.canManage && data.preview ? (
        <Notice>{m.nlPreviewNotice()}</Notice>
      ) : null}
      {editable && data.changedSince && data.state === "published" ? (
        <Notice
          action={{
            label: m.nlPublishChanges(),
            pending: republish.isPending,
            onClick: () =>
              void run(() => republish.mutateAsync(), m.nlChangesPublished()),
          }}
        >
          {m.nlChangesWaiting()}
        </Notice>
      ) : null}
      <NewsletterView
        content={data.content}
        translation={data.translation}
        primary={data.primaryLocale}
        locale={locale}
        onLocaleChange={setLocale}
      />
      {data.canManage && !data.preview ? <Report data={data} /> : null}
    </div>
  );
}
