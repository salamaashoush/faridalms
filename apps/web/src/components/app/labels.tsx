import type { LucideIcon } from "lucide-react";

import {
  Activity,
  BookOpen,
  Calculator,
  FlaskConical,
  Globe,
  Languages,
  Palette,
} from "lucide-react";

import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

type AttendanceStatus = "present" | "absent" | "late" | "excused";
type AssignmentType =
  | "written_assignment"
  | "project"
  | "reading"
  | "quiz"
  | "presentation";
type EventCategory = "general" | "national_vacation" | "school_vacation";

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  globe: Globe,
  activity: Activity,
  "book-open": BookOpen,
  calculator: Calculator,
  "flask-conical": FlaskConical,
  palette: Palette,
  languages: Languages,
};

export function SubjectIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const Icon = SUBJECT_ICONS[icon] ?? BookOpen;
  return <Icon className={cn("size-4", className)} aria-hidden />;
}

export const ASSIGNMENT_TYPE_LABEL: Record<AssignmentType, () => string> = {
  written_assignment: m.typeWrittenAssignment,
  project: m.typeProject,
  reading: m.typeReading,
  quiz: m.typeQuiz,
  presentation: m.typePresentation,
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, () => string> = {
  present: m.attendancePresent,
  absent: m.attendanceAbsent,
  late: m.attendanceLate,
  excused: m.attendanceExcused,
};

export const EVENT_CATEGORY_LABEL: Record<EventCategory, () => string> = {
  general: m.calendarGeneral,
  national_vacation: m.calendarNationalVacation,
  school_vacation: m.calendarSchoolVacation,
};

/** Category colours, used by both the month grid and the agenda legend. */
export const EVENT_CATEGORY_CLASS: Record<EventCategory, string> = {
  general: "bg-primary/10 text-primary border-primary/25",
  national_vacation:
    "bg-[var(--warning)]/15 text-[var(--warning-foreground)] border-[var(--warning)]/30 dark:text-[var(--warning)]",
  school_vacation:
    "bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/30",
};

/** Score as a percentage band, so a number also reads as good or poor. */
export function ScorePill({
  score,
  maxScore,
}: {
  score: number;
  maxScore: number;
}) {
  const percent = Math.round((score / maxScore) * 100);
  const className =
    percent >= 85
      ? "bg-[var(--success)]/15 text-[var(--success)]"
      : percent >= 60
        ? "bg-primary/10 text-primary"
        : "bg-destructive/15 text-destructive";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
        className,
      )}
    >
      {score}/{maxScore}
    </span>
  );
}
