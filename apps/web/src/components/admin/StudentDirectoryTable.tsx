import type { StudentDirectoryQuery } from "@faridalms/domain/school-schema";
import type { ColumnDef } from "@tanstack/react-table";

import { tableFeatures, useTable } from "@tanstack/react-table";

import { Value } from "~/components/app/primitives";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import * as m from "~/i18n/messages";

import { PersonAvatar } from "./PersonAvatar";
import { SortableHeader } from "./sorting";

const features = tableFeatures({});
interface Student {
  id: string;
  fullName: string;
  reference: string;
  photoUrl: string | null;
  grade: string | null;
  className: string | null;
  homeroomTeacher: string | null;
}
type Sort = StudentDirectoryQuery["sort"];

const columns: ColumnDef<typeof features, Student>[] = [
  {
    id: "name",
    accessorKey: "fullName",
    header: m.adminName,
    cell: ({ row }) => (
      <span className="flex items-center gap-3">
        <PersonAvatar
          name={row.original.fullName}
          photoUrl={row.original.photoUrl}
        />
        <span className="font-medium">{row.original.fullName}</span>
      </span>
    ),
  },
  { id: "reference", accessorKey: "reference", header: m.adminReference },
  {
    id: "grade",
    accessorKey: "grade",
    header: m.studentGrade,
    cell: ({ row }) => <Value>{row.original.grade}</Value>,
  },
  {
    id: "class",
    accessorKey: "className",
    header: m.studentClass,
    cell: ({ row }) => <Value>{row.original.className}</Value>,
  },
  {
    id: "homeroom",
    accessorKey: "homeroomTeacher",
    header: m.adminHomeroom,
    cell: ({ row }) => <Value>{row.original.homeroomTeacher}</Value>,
  },
];

export function StudentDirectoryTable({
  rows,
  sort,
  direction,
  onSort,
}: {
  rows: Student[];
  sort: Sort;
  direction: "asc" | "desc";
  onSort: (column: Sort) => void;
}) {
  const labels: Record<Sort, string> = {
    name: m.adminName(),
    reference: m.adminReference(),
    grade: m.studentGrade(),
    class: m.studentClass(),
    homeroom: m.adminHomeroom(),
  };
  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return (
    <Table>
      <TableCaption>{m.adminStudentsCaption()}</TableCaption>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => {
              const column = header.column.id as Sort;
              return (
                <SortableHeader
                  key={header.id}
                  column={column}
                  label={labels[column]}
                  active={sort === column}
                  direction={direction}
                  onSort={onSort}
                />
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id} className="py-4">
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
