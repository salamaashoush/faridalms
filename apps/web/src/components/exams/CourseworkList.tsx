import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ClipboardCheck, Users } from "lucide-react";

import type { Column } from "~/components/system/DataTable";

import { classTitle } from "~/components/classes/format";
import { DataTable } from "~/components/system/DataTable";
import { SheetPanel } from "~/components/system/SheetPanel";
import { StatusBadge } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { courseworkListQuery, courseworkStudentsQuery } from "~/queries/exams";
import { formatDate, formatNumber } from "~/utils/datetime";

import { AuthenticationStatus, DeclarationStatus } from "./Authentication";
import { isolatedLine, sessionName } from "./names";

type Row = Awaited<
  ReturnType<NonNullable<(typeof courseworkListQuery)["queryFn"]>>
>[number];

function Progress({ row }: { row: Row }) {
  return (
    <span className="grid gap-1 text-sm leading-5">
      <span>
        {m.examProgressHandedIn({
          count: formatNumber(row.handedIn),
          total: formatNumber(row.students),
        })}
      </span>
      <span className="text-[13px] leading-[18px] text-muted-foreground">
        {m.examProgressDeclared({ count: formatNumber(row.declared) })}
        {" · "}
        {m.examProgressConfirmed({ count: formatNumber(row.confirmed) })}
      </span>
    </span>
  );
}

function Flag({ row }: { row: Row }) {
  return row.notConfirmed ? (
    <StatusBadge tone="danger">
      {m.examFlagged({ count: formatNumber(row.notConfirmed) })}
    </StatusBadge>
  ) : null;
}

function columns(onOpen: (row: Row) => void): Column<Row>[] {
  return [
    {
      id: "title",
      header: m.examCourseworkTitle(),
      primary: true,
      cell: (row) => (
        <span className="grid gap-0.5">
          <button
            type="button"
            onClick={() => onOpen(row)}
            className="truncate text-start font-medium underline-offset-4 hover:underline"
            dir="auto"
          >
            {row.title}
          </button>
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {classTitle({
              titleEn: row.classTitleEn,
              titleAr: row.classTitleAr,
              code: row.classCode,
            })}
          </span>
        </span>
      ),
    },
    {
      id: "session",
      header: m.examSession(),
      cell: (row) => (
        <span className="grid gap-0.5">
          <span dir="auto">{row.session ? sessionName(row.session) : ""}</span>
          {row.component ? (
            <span
              dir="auto"
              className="text-[13px] leading-[18px] text-muted-foreground"
            >
              {row.component}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "progress",
      header: m.examProgress(),
      cell: (row) => <Progress row={row} />,
    },
    { id: "flag", header: m.examFlags(), cell: (row) => <Flag row={row} /> },
  ];
}

function card(onOpen: (row: Row) => void) {
  return {
    title: (row: Row) => (
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="text-start font-medium"
        dir="auto"
      >
        {row.title}
      </button>
    ),
    status: (row: Row) => <Flag row={row} />,
    fact: (row: Row) =>
      m.examProgressHandedIn({
        count: formatNumber(row.handedIn),
        total: formatNumber(row.students),
      }),
  };
}

/** Every piece of assessed coursework in the school, for its exams officers. */
export function CourseworkList({ onOpen }: { onOpen: (row: Row) => void }) {
  const rows = useSuspenseQuery(courseworkListQuery).data;
  return (
    <DataTable
      caption={m.examCourseworkCaption()}
      rows={rows.map((row) => ({ ...row, id: row.assignmentId }))}
      columns={columns(onOpen)}
      rowLabel={(row) => row.title}
      rowActions={(row) => [
        {
          label: m.examViewStudents(),
          icon: Users,
          onSelect: () => onOpen(row),
        },
      ]}
      card={card(onOpen)}
      empty={{
        icon: ClipboardCheck,
        title: m.examCourseworkEmpty(),
        description: m.examCourseworkEmptyHint(),
      }}
    />
  );
}

/** One piece of coursework, student by student. */
export function CourseworkStudents({
  open,
  assignmentId,
  title,
  onOpenChange,
}: {
  open: boolean;
  assignmentId: string;
  title: string;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useQuery({
    ...courseworkStudentsQuery(assignmentId),
    enabled: open,
  }).data;
  return (
    <SheetPanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={
        detail?.session
          ? isolatedLine([
              sessionName(detail.session),
              detail.component,
              m.examKeepUntilOn({ date: formatDate(detail.session.keepUntil) }),
            ])
          : undefined
      }
    >
      {detail ? (
        <ul className="grid divide-y">
          {detail.students.map((student) => (
            <li key={student.studentId} className="grid gap-1.5 py-3">
              <span className="text-sm leading-5 font-medium" dir="auto">
                {inLocale(student.fullNameEn, student.fullNameAr)}
              </span>
              {detail.declarationRequired ? (
                <DeclarationStatus student={student} />
              ) : null}
              {student.attemptId ? (
                <AuthenticationStatus student={student} />
              ) : null}
              {student.authentication?.note ? (
                <q dir="auto" className="text-[13px] leading-[18px]">
                  {student.authentication.note}
                </q>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div aria-busy="true" className="min-h-20" />
      )}
    </SheetPanel>
  );
}
