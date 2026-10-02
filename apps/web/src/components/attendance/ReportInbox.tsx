import { Button } from "@faridalms/ui/button";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Inbox, Paperclip, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Column, RowAction } from "~/components/system/DataTable";
import type { Facet } from "~/components/system/IndexPage";

import { DataTable } from "~/components/system/DataTable";
import { FormField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { absenceReportInboxQuery } from "~/queries/attendance";
import { decideAbsenceReport } from "~/server/attendance";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import {
  DECISION_LABEL,
  DECISION_TONE,
  reasonOf,
  reportWhat,
} from "./FamilyReports";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof absenceReportInboxQuery>["queryFn"]>>
>;
type Report = Data["reports"][number];

export type InboxView = "waiting" | "all";

const studentOf = (row: Report) =>
  inLocale(row.studentNameEn, row.studentNameAr);

function Decision({ row }: { row: Report }) {
  return (
    <StatusText tone={DECISION_TONE[row.decision]}>
      {row.decision === "pending"
        ? m.repWaiting()
        : DECISION_LABEL[row.decision]()}
    </StatusText>
  );
}

function Detail({ row }: { row: Report }) {
  return (
    <span className="grid gap-0.5">
      <span>{reasonOf(row)}</span>
      {row.note ? (
        <bdi className="line-clamp-2 text-[13px] leading-[18px] text-muted-foreground">
          {row.note}
        </bdi>
      ) : null}
      {row.fileId ? (
        <a
          href={`/files/${row.fileId}`}
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 text-[13px] leading-[18px] text-primary underline-offset-4 hover:underline"
        >
          <Paperclip className="size-3.5" aria-hidden />
          <bdi>{row.fileName ?? m.repFileOpen()}</bdi>
        </a>
      ) : null}
    </span>
  );
}

const decision = (row: Report) => <Decision row={row} />;
const detail = (row: Report) => <Detail row={row} />;

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(): Column<Report>[] {
  return [
    {
      id: "student",
      header: m.attStudent(),
      primary: true,
      cell: studentOf,
    },
    { id: "what", header: m.repKind(), cell: (row) => reportWhat(row) },
    { id: "reason", header: m.repReason(), cell: detail },
    {
      id: "from",
      header: m.repFromWhom(),
      cell: (row) =>
        m.repReportedOn({
          name: inLocale(row.reporterNameEn, row.reporterNameAr),
          date: formatDate(row.createdAt),
        }),
    },
    { id: "decision", header: m.attStatus(), cell: decision },
  ];
}

const card = {
  title: studentOf,
  status: decision,
  fact: (row: Report) => `${reportWhat(row)} · ${reasonOf(row)}`,
};

/**
 * What families have reported, for the office to accept or decline: an
 * accepted absence gives the marks on its days their reason, before or
 * after the registers are taken.
 */
export function ReportInbox({
  view,
  onView,
}: {
  view: InboxView;
  onView: (view: InboxView) => void;
}) {
  const data = useSuspenseQuery(
    absenceReportInboxQuery(view === "waiting"),
  ).data;
  const queryClient = useQueryClient();
  const decide = useServerFn(decideAbsenceReport);
  const [declining, setDeclining] = useState<Report | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["attendance"] });
  const accept = async (row: Report) => {
    await decide({ data: { id: row.id, decision: "accepted" } });
    toast.success(m.repAcceptedToast({ name: studentOf(row) }));
    await refresh();
  };
  const actions = (row: Report): RowAction[] =>
    row.decision === "pending"
      ? [
          {
            label: m.repAccept(),
            icon: Check,
            inline: true,
            onSelect: () => accept(row),
          },
          {
            label: m.repDecline(),
            icon: X,
            onSelect: () => setDeclining(row),
          },
        ]
      : [];
  const viewFacet: Facet = {
    id: "view",
    label: m.repShow(),
    single: true,
    options: [
      { value: "waiting", label: m.repWaiting() },
      { value: "all", label: m.repAll() },
    ],
    selected: [view],
    defaultSelected: ["waiting"],
    onChange: ([next]) => onView(next === "all" ? "all" : "waiting"),
  };
  return (
    <>
      <DataTable
        caption={m.repInbox()}
        rows={data.reports}
        columns={columns()}
        rowLabel={studentOf}
        rowActions={actions}
        toolbar={{ facets: [viewFacet] }}
        card={card}
        empty={{
          icon: Inbox,
          title: view === "waiting" ? m.repNoneWaiting() : m.repNoneAtAll(),
          description: m.repNoneWaitingBody(),
          action:
            view === "waiting" ? (
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                onClick={() => onView("all")}
              >
                {m.repShowAll()}
              </Button>
            ) : undefined,
        }}
      />
      {declining ? (
        <DeclineSheet
          report={declining}
          onClose={() => setDeclining(null)}
          onDone={refresh}
        />
      ) : null}
    </>
  );
}

function DeclineSheet({
  report,
  onClose,
  onDone,
}: {
  report: Report;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const decide = useServerFn(decideAbsenceReport);
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () =>
      decide({ data: { id: report.id, decision: "declined", note } }),
    onSuccess: async () => {
      toast.success(m.repDeclinedToast({ name: studentOf(report) }));
      await onDone();
      onClose();
    },
  });
  return (
    <SheetForm
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.repDeclineTitle({ name: studentOf(report) })}
      submitLabel={m.repDecline()}
      destructive
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={() => save.mutate()}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {reportWhat(report)} · {reasonOf(report)}
      </p>
      <p className="text-sm leading-5">{m.repDeclineBody()}</p>
      <FormField
        id="decline-note"
        label={m.repDeclineNote()}
        hint={m.repDeclineHint()}
        optional
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}
