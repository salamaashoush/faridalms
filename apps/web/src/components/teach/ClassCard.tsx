import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Suspense } from "react";

import { SubjectIcon } from "~/components/app/labels";
import { Field, FieldGrid, Value } from "~/components/app/primitives";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import * as m from "~/i18n/messages";
import { classQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

import type { Stage } from "./format";

import { STAGE_LABEL, studentName, subjectName } from "./format";

export interface TeachingClass {
  id: string;
  name: string;
  grade: string;
  stage: Stage;
  room: string | null;
  enrolledCount: number;
  subjects: ({ name: string; slug: string; icon: string } | null)[];
}

function Roster({ classId }: { classId: string }) {
  const detail = useSuspenseQuery(classQuery(classId)).data;

  if (detail.roster.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{m.teachRosterEmpty()}</p>
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {detail.roster.map((student) => (
        <li
          key={student.id}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg bg-muted/50 px-3 py-2"
        >
          <Link
            to="/students/$studentId"
            params={{ studentId: student.id }}
            search={{}}
            className="text-sm font-medium hover:text-primary hover:underline"
          >
            {studentName(student)}
          </Link>
          <span className="text-xs text-muted-foreground">
            {m.teachReference()}
            {": "}
            <Value>{student.reference}</Value>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ClassCard({
  row,
  open,
  onToggle,
}: {
  row: TeachingClass;
  open: boolean;
  onToggle: () => void;
}) {
  const rosterId = `roster-${row.id}`;
  const subjects = row.subjects.flatMap((subject) =>
    subject ? [subject] : [],
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              <Link
                to="/classes/$classId"
                params={{ classId: row.id }}
                search={{}}
                className="hover:text-primary hover:underline"
              >
                {row.name}
              </Link>
            </h2>
            <p className="text-xs text-muted-foreground">
              {STAGE_LABEL[row.stage]()}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={open}
            aria-controls={rosterId}
            aria-label={
              open
                ? m.teachHideRosterFor({ class: row.name })
                : m.teachShowRosterFor({ class: row.name })
            }
            onClick={onToggle}
          >
            {open ? m.teachHideRoster() : m.teachShowRoster()}
            {open ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          </Button>
        </div>

        <FieldGrid>
          <Field label={m.studentGrade()}>{row.grade}</Field>
          <Field label={m.adminRoom()}>{row.room}</Field>
          <Field label={m.adminEnrolled()}>
            {formatNumber(row.enrolledCount)}
          </Field>
        </FieldGrid>

        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {m.teachSubjects()}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {subjects.length === 0 ? (
              <li className="text-sm">
                <Value>{null}</Value>
              </li>
            ) : (
              subjects.map((subject) => (
                <li
                  key={subject.slug}
                  className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
                >
                  <SubjectIcon icon={subject.icon} className="size-3.5" />
                  {subjectName(subject)}
                </li>
              ))
            )}
          </ul>
        </div>

        <div id={rosterId} hidden={!open}>
          {open ? (
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {m.teachRoster()}
              </p>
              <Suspense
                fallback={
                  <p className="text-sm text-muted-foreground">
                    {m.commonLoading()}
                  </p>
                }
              >
                <Roster classId={row.id} />
              </Suspense>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
