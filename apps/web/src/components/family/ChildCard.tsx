import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardList,
  TriangleAlert,
  UserCheck,
} from "lucide-react";

import { ButtonLink } from "~/components/app/ButtonLink";
import {
  Field,
  SectionCard,
  StatTile,
  Value,
} from "~/components/app/primitives";
import { initialsOf } from "~/components/app/UserMenu";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import { formatDate } from "./format";

export interface ChildCardProps {
  student: {
    id: string;
    fullName: string;
    className: string | null;
    grade: string | null;
    photoUrl: string | null;
  };
  attendanceRate: number | null;
  average: number | null;
  dueThisWeek: number;
  overdue: number;
  nextDue: { id: string; title: string; dueDate: string } | null;
}

function rateTone(
  value: number | null,
): "default" | "positive" | "warning" | "critical" {
  if (value === null) {
    return "default";
  }
  if (value >= 90) {
    return "positive";
  }
  return value >= 75 ? "warning" : "critical";
}

function percentOrAbsent(value: number | null) {
  return value === null ? (
    <Value>{null}</Value>
  ) : (
    m.familyPercentValue({ value: formatNumber(value) })
  );
}

export function ChildCard({
  student,
  attendanceRate,
  average,
  dueThisWeek,
  overdue,
  nextDue,
}: ChildCardProps) {
  return (
    <SectionCard
      title={student.fullName}
      description={student.grade ?? undefined}
      actions={
        <ButtonLink
          size="sm"
          variant="outline"
          to="/family/children"
          search={{ studentId: student.id }}
        >
          {m.familyOpenProfile()}
        </ButtonLink>
      }
    >
      <div className="flex items-start gap-4">
        <Avatar className="size-14 shrink-0">
          {student.photoUrl ? (
            <AvatarImage
              src={student.photoUrl}
              alt={m.familyPhotoAlt({ name: student.fullName })}
            />
          ) : null}
          <AvatarFallback className="text-base font-semibold">
            {initialsOf(student.fullName)}
          </AvatarFallback>
        </Avatar>

        <dl className="grid min-w-0 flex-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <Field label={m.studentClass()}>{student.className}</Field>
          <Field label={m.overviewNextDue()}>
            {nextDue ? (
              <span className="flex flex-col leading-tight">
                <Link
                  to="/assignments/$assignmentId"
                  params={{ assignmentId: nextDue.id }}
                  search={{}}
                  className="hover:text-primary hover:underline"
                >
                  {nextDue.title}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {m.assignmentsDue({ date: formatDate(nextDue.dueDate) })}
                </span>
              </span>
            ) : null}
          </Field>
        </dl>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          compact
          label={m.overviewAttendanceRate()}
          value={percentOrAbsent(attendanceRate)}
          icon={UserCheck}
          tone={rateTone(attendanceRate)}
        />
        <StatTile
          compact
          label={m.overviewAverageGrade()}
          value={percentOrAbsent(average)}
          icon={BookOpen}
          tone={rateTone(average)}
        />
        <StatTile
          compact
          label={m.overviewDueThisWeek()}
          value={formatNumber(dueThisWeek)}
          icon={ClipboardList}
        />
        <StatTile
          compact
          label={m.overviewOverdue()}
          value={formatNumber(overdue)}
          icon={TriangleAlert}
          tone={overdue > 0 ? "critical" : "positive"}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink
          size="sm"
          variant="ghost"
          to="/family/assignments"
          search={{ studentId: student.id }}
        >
          {m.navAssignments()}
        </ButtonLink>
        <ButtonLink
          size="sm"
          variant="ghost"
          to="/family/grades"
          search={{ studentId: student.id }}
        >
          {m.navGrades()}
        </ButtonLink>
        <ButtonLink
          size="sm"
          variant="ghost"
          to="/family/attendance"
          search={{ studentId: student.id }}
        >
          {m.navAttendance()}
        </ButtonLink>
        <ButtonLink
          size="sm"
          variant="ghost"
          to="/family/timetable"
          search={{ studentId: student.id }}
        >
          {m.navTimetable()}
        </ButtonLink>
      </div>
    </SectionCard>
  );
}
