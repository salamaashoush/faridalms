import { EmptyState, Value } from "~/components/app/primitives";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

export interface ClassListRow {
  id: string;
  name: string;
  grade: string;
  homeroomTeacher: { name: string } | null;
  enrolledCount: number;
}

export function ClassesTable({ rows }: { rows: ClassListRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title={m.adminClassesEmpty()} />;
  }

  return (
    <>
      <ul className="flex flex-col gap-3 sm:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-border p-3">
            <p className="text-sm font-semibold">{row.name}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">
                  {m.studentGrade()}
                </dt>
                <dd>
                  <Value>{row.grade}</Value>
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">
                  {m.adminEnrolled()}
                </dt>
                <dd className="tabular-nums">
                  {formatNumber(row.enrolledCount)}
                </dd>
              </div>
              <div className="col-span-2 flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">
                  {m.adminHomeroom()}
                </dt>
                <dd>
                  <Value>{row.homeroomTeacher?.name}</Value>
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden sm:block">
        <Table>
          <TableCaption>{m.adminClassListCaption()}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{m.studentClass()}</TableHead>
              <TableHead>{m.studentGrade()}</TableHead>
              <TableHead>{m.adminHomeroom()}</TableHead>
              <TableHead className="text-end">{m.adminEnrolled()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  <Value>{row.grade}</Value>
                </TableCell>
                <TableCell>
                  <Value>{row.homeroomTeacher?.name}</Value>
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {formatNumber(row.enrolledCount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
