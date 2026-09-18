import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { SubjectIcon } from "~/components/app/labels";
import { EmptyState, Value } from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
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
import { classQuery } from "~/queries/school";

export function ClassRoster({ classId }: { classId: string }) {
  const detail = useSuspenseQuery(classQuery(classId)).data;
  const subjects = detail.subjects.flatMap((link) =>
    link.subject === null
      ? []
      : [{ subject: link.subject, teacher: link.teacher }],
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {m.adminSubjectsTaught()}
        </h3>
        {subjects.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {m.adminNoSubjects()}
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {subjects.map((link) => (
              <li key={link.subject.id}>
                <Badge variant="outline" className="h-auto gap-1.5 py-1">
                  <SubjectIcon icon={link.subject.icon} />
                  <span>{link.subject.name}</span>
                  {link.teacher ? (
                    <span className="text-muted-foreground">
                      {m.adminSubjectTaughtBy({ name: link.teacher.name })}
                    </span>
                  ) : null}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detail.roster.length === 0 ? (
        <EmptyState title={m.adminRosterEmpty()} />
      ) : (
        <>
          <ul className="flex flex-col gap-2 sm:hidden">
            {detail.roster.map((student) => (
              <li
                key={student.id}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
              >
                <PersonAvatar
                  name={`${student.firstName} ${student.lastName}`}
                  photoUrl={student.photoUrl}
                />
                <div className="min-w-0">
                  <Link
                    to="/students/$studentId"
                    params={{ studentId: student.id }}
                    search={{}}
                    className="truncate text-sm font-medium hover:text-primary hover:underline"
                  >
                    {student.firstName} {student.lastName}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {m.adminReference()}: <Value>{student.reference}</Value>
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden sm:block">
            <Table>
              <TableCaption>
                {m.adminRosterCaption({ name: detail.name })}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.adminName()}</TableHead>
                  <TableHead>{m.adminReference()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.roster.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <PersonAvatar
                          name={`${student.firstName} ${student.lastName}`}
                          photoUrl={student.photoUrl}
                        />
                        <Link
                          to="/students/$studentId"
                          params={{ studentId: student.id }}
                          search={{}}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {student.firstName} {student.lastName}
                        </Link>
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <Value>{student.reference}</Value>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
