import type { AbsencesQuery } from "@faridalms/domain/attendance";
import type {
  BatchAction,
  Column,
  RowAction,
} from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { Input } from "@faridalms/ui/input";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CircleCheck, UserCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { classTitle } from "~/components/classes/format";
import { displayName } from "~/components/people/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { absencesQuery } from "~/queries/attendance";
import { excuseAbsences } from "~/server/attendance";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { labelOf, markText, MEANING_TONE } from "./format";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof absencesQuery>["queryFn"]>>
>;
type Row = Data["rows"][number];

function StudentLink({ row }: { row: Row }) {
  return (
    <RowLink
      to="/students/$studentId"
      params={{ studentId: row.studentId }}
      search={{ tab: "attendance" }}
    >
      {displayName(row)}
    </RowLink>
  );
}

function Mark({ row }: { row: Row }) {
  return (
    <StatusText tone={MEANING_TONE[row.meaning]}>{markText(row)}</StatusText>
  );
}

function where(row: Row) {
  return [
    classTitle({
      code: row.classCode,
      titleEn: row.classTitleEn,
      titleAr: row.classTitleAr,
    }),
    inLocale(row.periodNameEn, row.periodNameAr),
  ].join(" · ");
}

function Reason({ row, reasons }: { row: Row; reasons: Data["reasons"] }) {
  const reason = reasons.find((entry) => entry.id === row.reasonId);
  if (reason) return <span>{labelOf(reason)}</span>;
  if (row.meaning === "absent" || row.meaning === "late")
    return <StatusText tone="warning">{m.attUnexplained()}</StatusText>;
  return <span className="text-muted-foreground">–</span>;
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(reasons: Data["reasons"]): Column<Row>[] {
  return [
    {
      id: "student",
      header: m.attStudent(),
      primary: true,
      cell: (row) => <StudentLink row={row} />,
    },
    { id: "date", header: m.attDate(), cell: (row) => formatDate(row.date) },
    { id: "where", header: m.attClass(), cell: (row) => where(row) },
    { id: "mark", header: m.attMark(), cell: (row) => <Mark row={row} /> },
    {
      id: "reason",
      header: m.attReason(),
      cell: (row) => <Reason row={row} reasons={reasons} />,
    },
  ];
}

const card = {
  title: (row: Row) => <StudentLink row={row} />,
  status: (row: Row) => <Mark row={row} />,
  fact: (row: Row) => `${formatDate(row.date)} · ${where(row)}`,
};

function excusable(row: Row) {
  return row.meaning === "absent" || (row.meaning === "late" && !row.reasonId);
}

function ExcuseSheet({
  rows,
  reasons,
  onClose,
}: {
  rows: Row[];
  reasons: Data["reasons"];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reasonId, setReasonId] = useState(reasons[0]?.id ?? "");
  const [note, setNote] = useState("");
  const excuse = useMutation({
    mutationFn: () =>
      excuseAbsences({
        data: {
          marks: rows.map((row) => ({ id: row.id, date: row.date })),
          reasonId,
          note: note.trim(),
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={m.attExcuseTitle({ count: rows.length })}
      submitLabel={m.attExcuse()}
      pending={excuse.isPending}
      error={excuse.error ? getMessageFromError(excuse.error) : null}
      onSubmit={() =>
        excuse.mutateAsync().then(
          async (result) => {
            toast.success(m.attExcusedToast({ count: result.excused }));
            await queryClient.invalidateQueries({ queryKey: ["attendance"] });
            onClose();
          },
          () => undefined,
        )
      }
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.attExcuseHint()}
      </p>
      <SelectField
        id="excuse-reason"
        label={m.attReason()}
        value={reasonId}
        options={reasons.map((reason) => ({
          value: reason.id,
          label: labelOf(reason),
        }))}
        onChange={setReasonId}
        width="name"
      />
      <TextField
        id="excuse-note"
        label={m.attNote()}
        optional
        dir="auto"
        maxLength={500}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
    </SheetForm>
  );
}

export function Absences({
  query,
  onChange,
}: {
  query: AbsencesQuery;
  onChange: (change: Partial<AbsencesQuery>) => void;
}) {
  const data = useSuspenseQuery(absencesQuery(query)).data;
  const [excusing, setExcusing] = useState<Row[] | null>(null);
  const showFacet: Facet = {
    id: "show",
    label: m.attShow(),
    single: true,
    options: [
      { value: "unexplained", label: m.attShowUnexplained() },
      { value: "all", label: m.attShowAll() },
    ],
    selected: [query.show],
    defaultSelected: ["unexplained"],
    onChange: ([next]) =>
      onChange({ show: next === "all" ? "all" : "unexplained" }),
  };
  const batch: BatchAction<Row>[] = [
    {
      label: m.attExcuse(),
      icon: CircleCheck,
      onSelect: (selected) => setExcusing(selected.filter(excusable)),
    },
  ];
  const rowActions = (row: Row): RowAction[] =>
    excusable(row)
      ? [
          {
            label: m.attExcuse(),
            icon: CircleCheck,
            onSelect: () => setExcusing([row]),
          },
        ]
      : [];
  const min = data.year?.startsOn ?? "";
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <label
            htmlFor="absences-from"
            className="text-sm leading-5 font-medium"
          >
            {m.attFrom()}
          </label>
          <Input
            id="absences-from"
            type="date"
            className="w-40 max-md:h-10"
            value={data.from}
            min={min}
            max={data.to}
            onChange={(event) =>
              event.target.value && onChange({ from: event.target.value })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <label
            htmlFor="absences-to"
            className="text-sm leading-5 font-medium"
          >
            {m.attTo()}
          </label>
          <Input
            id="absences-to"
            type="date"
            className="w-40 max-md:h-10"
            value={data.to}
            min={data.from}
            max={data.today}
            onChange={(event) =>
              event.target.value && onChange({ to: event.target.value })
            }
          />
        </div>
      </div>
      <DataTable
        caption={m.attAbsencesCaption()}
        rows={data.rows}
        columns={columns(data.reasons)}
        rowLabel={(row) => `${displayName(row)} ${formatDate(row.date)}`}
        toolbar={{
          search: {
            value: query.q,
            onChange: (q) => onChange({ q }),
            label: m.attSearchStudents(),
            placeholder: m.attSearchStudentsPlaceholder(),
          },
          facets: [showFacet],
          onReset: () => onChange({ q: "", show: "unexplained" }),
        }}
        rowActions={rowActions}
        batchActions={batch}
        card={card}
        empty={{
          icon: UserCheck,
          title:
            query.show === "unexplained"
              ? m.attNoUnexplained()
              : m.attNoAbsences(),
          description: m.attNoAbsencesBody(),
        }}
      />
      {excusing?.length ? (
        <ExcuseSheet
          rows={excusing}
          reasons={data.reasons}
          onClose={() => setExcusing(null)}
        />
      ) : null}
    </div>
  );
}
