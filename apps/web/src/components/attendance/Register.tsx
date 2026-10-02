import type {
  AttendanceMeaning,
  CheckInWay,
} from "@faridalms/domain/attendance";

import {
  ATTENDANCE_MEANINGS,
  minutesLate,
  TIMED_MEANINGS,
} from "@faridalms/domain/attendance";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import {
  CircleAlert,
  ListChecks,
  MonitorSmartphone,
  NotebookPen,
  Save,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { UnsavedChangesGuard } from "~/components/app/UnsavedChangesGuard";
import { classTitle } from "~/components/classes/format";
import { displayName } from "~/components/people/format";
import { SelectField } from "~/components/system/field";
import { RecordHeader } from "~/components/system/RecordPage";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { registerQuery } from "~/queries/attendance";
import { saveRegister } from "~/server/attendance";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { CheckInScreen } from "./CheckInScreen";
import { DayNav } from "./DayNav";
import {
  formatDay,
  formatSavedAt,
  labelOf,
  MEANING_LABEL,
  MEANING_SHORT,
  STATE_LABEL,
  STATE_TONE,
} from "./format";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof registerQuery>["queryFn"]>>
>;
type Student = Data["students"][number];

interface Draft {
  meaning: AttendanceMeaning | null;
  reasonId: string;
  minutes: string;
  note: string;
}

type Drafts = Record<string, Draft>;

const BLANK: Draft = { meaning: null, reasonId: "", minutes: "", note: "" };

const SELECTED: Record<AttendanceMeaning, string> = {
  present:
    "peer-checked:border-success peer-checked:bg-success peer-checked:text-white",
  absent:
    "peer-checked:border-destructive peer-checked:bg-destructive peer-checked:text-white",
  late: "peer-checked:border-warning peer-checked:bg-warning peer-checked:text-warning-foreground",
  excused:
    "peer-checked:border-info peer-checked:bg-info peer-checked:text-white",
  left_early:
    "peer-checked:border-warning peer-checked:bg-warning peer-checked:text-warning-foreground",
};

function draftsOf(data: Data): Drafts {
  const drafts: Drafts = {};
  for (const student of data.students) drafts[student.id] = BLANK;
  for (const mark of data.marks)
    drafts[mark.studentId] = {
      meaning: mark.meaning,
      reasonId: mark.reasonId ?? "",
      minutes: mark.minutes === null ? "" : String(mark.minutes),
      note: mark.note ?? "",
    };
  return drafts;
}

/**
 * Blank rows for children whose family reported them away start marked
 * absent with that reason, for the teacher to confirm or change.
 */
function withReports(drafts: Drafts, data: Data): Drafts {
  const next = { ...drafts };
  for (const report of data.reports)
    if (report.kind === "absent" && !next[report.studentId]?.meaning)
      next[report.studentId] = {
        ...BLANK,
        meaning: "absent",
        reasonId: report.reasonId,
      };
  // A child signed out before this period started is away for it.
  const start = data.period.startTime;
  for (const movement of data.movements)
    if (
      movement.direction === "out" &&
      start &&
      movement.at <= start &&
      !next[movement.studentId]?.meaning
    )
      next[movement.studentId] = {
        ...BLANK,
        meaning: "absent",
        reasonId: movement.reasonId ?? "",
      };
  return next;
}

function minutesIssue(draft: Draft): string | null {
  if (!draft.meaning || !TIMED_MEANINGS.includes(draft.meaning)) return null;
  if (draft.minutes === "") return null;
  const value = Number(draft.minutes);
  return Number.isInteger(value) && value >= 1 && value <= 600
    ? null
    : m.attMinutesInvalid();
}

const CHECKED_IN: Record<CheckInWay, () => string> = {
  touch: m.attCheckedInTouch,
  qr: m.attCheckedInQr,
  nfc: m.attCheckedInNfc,
};

const ACCESS_NOTE = {
  closed: m.attClosedYear,
  future: m.attFutureDay,
  window: m.attOutsideWindow,
  not_school_day: m.attNotSchoolDay,
} as const;

function MarkChoice({
  name,
  student,
  draft,
  disabled,
  onMark,
}: {
  name: string;
  student: Student;
  draft: Draft;
  disabled: boolean;
  onMark: (meaning: AttendanceMeaning) => void;
}) {
  return (
    <fieldset className="flex shrink-0 gap-1" disabled={disabled}>
      <legend className="sr-only">
        {m.attMarkFor({ name: displayName(student) })}
      </legend>
      {ATTENDANCE_MEANINGS.map((meaning) => (
        <label key={meaning} className="relative">
          <input
            type="radio"
            name={name}
            value={meaning}
            checked={draft.meaning === meaning}
            onChange={() => onMark(meaning)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={cn(
              "flex size-9 cursor-pointer items-center justify-center rounded-md border bg-background text-sm font-semibold text-muted-foreground transition-colors select-none hover:bg-muted max-md:size-10",
              "peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
              SELECTED[meaning],
            )}
          >
            {MEANING_SHORT[meaning]()}
          </span>
          <span className="sr-only">{MEANING_LABEL[meaning]()}</span>
        </label>
      ))}
    </fieldset>
  );
}

const REPORTED: Record<
  Data["reports"][number]["kind"],
  (input: { time: string; reason: string }) => string
> = {
  absent: ({ reason }) => m.attReportedAway({ reason }),
  late: m.attReportedLate,
  early: m.attReportedEarly,
};

function StudentRow({
  student,
  draft,
  earlier,
  report,
  movements,
  via,
  reasons,
  lateNow,
  closesMinutes,
  disabled,
  onChange,
}: {
  student: Student;
  draft: Draft;
  earlier: Data["earlier"];
  /** What the family told the school about this day. */
  report: Data["reports"][number] | undefined;
  /** When reception signed the child in or out that day. */
  movements: Data["movements"];
  /** How late someone arriving now is, on today's register. */
  lateNow: () => number | null;
  closesMinutes: number;
  /** How the child marked themselves in, while that mark stands. */
  via: CheckInWay | null;
  reasons: Data["reasons"];
  disabled: boolean;
  onChange: (next: Draft) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(Boolean(draft.note || draft.reasonId));
  const timed =
    draft.meaning !== null && TIMED_MEANINGS.includes(draft.meaning);
  const explained = draft.meaning !== null && draft.meaning !== "present";
  const issue = minutesIssue(draft);
  const name = displayName(student);
  return (
    <li className="grid gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-40 items-center gap-3">
          <PersonAvatar
            name={name}
            photoUrl={
              student.photoFileId ? `/files/${student.photoFileId}` : null
            }
          />
          <div className="grid min-w-0 gap-0.5">
            <bdi className="text-sm leading-5 font-medium">{name}</bdi>
            {via && draft.meaning === "present" ? (
              <span className="text-[13px] leading-[18px] text-success">
                {CHECKED_IN[via]()}
              </span>
            ) : null}
            {report ? (
              <span className="text-[13px] leading-[18px] text-info">
                {REPORTED[report.kind]({
                  time: report.at ?? "",
                  reason: labelOf(
                    reasons.find((row) => row.id === report.reasonId) ?? {
                      labelEn: null,
                      labelAr: null,
                    },
                  ),
                })}
                {report.accepted ? ` · ${m.repAccepted()}` : null}
              </span>
            ) : null}
            {movements.map((movement) => (
              <span
                key={`${movement.direction}-${movement.at}`}
                className="text-[13px] leading-[18px] text-info"
              >
                {movement.direction === "in"
                  ? m.attSignedIn({ time: movement.at })
                  : m.attSignedOut({ time: movement.at })}
              </span>
            ))}
            {earlier.length ? (
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {earlier
                  .map((mark) =>
                    m.attEarlierMark({
                      mark: MEANING_LABEL[mark.meaning](),
                      period: inLocale(mark.periodNameEn, mark.periodNameAr),
                    }),
                  )
                  .join(" · ")}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <MarkChoice
            name={`${id}-mark`}
            student={student}
            draft={draft}
            disabled={disabled}
            onMark={(meaning) =>
              onChange({
                ...draft,
                meaning,
                minutes: TIMED_MEANINGS.includes(meaning)
                  ? draft.minutes ||
                    (meaning === "late" ? String(lateNow() ?? "") : "")
                  : "",
              })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="max-md:size-10"
            aria-expanded={open}
            aria-controls={`${id}-details`}
            aria-label={m.attDetailsFor({ name })}
            onClick={() => setOpen(!open)}
          >
            <NotebookPen aria-hidden />
          </Button>
        </div>
      </div>
      {timed ? (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <label
            htmlFor={`${id}-minutes`}
            className="text-[13px] leading-[18px] text-muted-foreground"
          >
            {draft.meaning === "late"
              ? m.attMinutesLate()
              : m.attMinutesEarly()}
          </label>
          <Input
            id={`${id}-minutes`}
            inputMode="numeric"
            className="w-20 max-md:h-10"
            disabled={disabled}
            value={draft.minutes}
            aria-invalid={issue ? true : undefined}
            aria-describedby={issue ? `${id}-minutes-error` : undefined}
            onChange={(event) =>
              onChange({ ...draft, minutes: event.target.value.trim() })
            }
          />
          {issue ? (
            <span
              id={`${id}-minutes-error`}
              className="text-[13px] leading-[18px] text-destructive"
            >
              {issue}
            </span>
          ) : draft.meaning === "late" &&
            Number(draft.minutes) > closesMinutes ? (
            <span className="text-[13px] leading-[18px] text-warning-foreground dark:text-warning">
              {m.attAfterClose()}
            </span>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <div
          id={`${id}-details`}
          className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2"
        >
          {explained ? (
            <SelectField
              id={`${id}-reason`}
              label={m.attReason()}
              optional
              value={draft.reasonId}
              disabled={disabled}
              options={[
                { value: "", label: m.attNoReason() },
                ...reasons.map((reason) => ({
                  value: reason.id,
                  label: labelOf(reason),
                })),
              ]}
              onChange={(reasonId) => onChange({ ...draft, reasonId })}
            />
          ) : null}
          <div className="grid gap-1.5">
            <label
              htmlFor={`${id}-note`}
              className="text-sm leading-5 font-medium"
            >
              {m.attNote()}
            </label>
            <Input
              id={`${id}-note`}
              dir="auto"
              maxLength={500}
              className="max-md:h-10"
              disabled={disabled}
              value={draft.note}
              onChange={(event) =>
                onChange({ ...draft, note: event.target.value })
              }
            />
          </div>
          {draft.meaning && !disabled ? (
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="ghost"
                className="max-md:h-10"
                onClick={() => onChange(BLANK)}
              >
                {m.attClearMark()}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Summary({ drafts }: { drafts: Drafts }) {
  const counts = new Map<AttendanceMeaning | null, number>();
  for (const draft of Object.values(drafts))
    counts.set(draft.meaning, (counts.get(draft.meaning) ?? 0) + 1);
  const parts = ATTENDANCE_MEANINGS.filter((meaning) =>
    counts.get(meaning),
  ).map(
    (meaning) =>
      `${formatNumber(counts.get(meaning) ?? 0)} ${MEANING_LABEL[meaning]()}`,
  );
  const unmarked = counts.get(null) ?? 0;
  return (
    <p
      aria-live="polite"
      className="min-w-0 flex-1 text-[13px] leading-[18px] text-muted-foreground"
    >
      {[
        ...parts,
        ...(unmarked ? [m.attUnmarkedCount({ count: unmarked })] : []),
      ].join(" · ")}
    </p>
  );
}

function RegisterForm({ data }: { data: Data }) {
  const hydrated = useHydrated();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [initial] = useState(() => draftsOf(data));
  const [drafts, setDrafts] = useState(() => withReports(initial, data));
  const editable = data.access.editable;
  const save = useMutation({
    mutationFn: () =>
      saveRegister({
        data: {
          classId: data.class.id,
          date: data.date,
          periodId: data.period.id,
          expectedVersion: data.register?.version ?? 0,
          marks: data.students.flatMap((student) => {
            const draft = drafts[student.id] ?? BLANK;
            if (!draft.meaning) return [];
            return [
              {
                studentId: student.id,
                meaning: draft.meaning,
                reasonId: draft.meaning === "present" ? "" : draft.reasonId,
                minutes:
                  TIMED_MEANINGS.includes(draft.meaning) && draft.minutes
                    ? Number(draft.minutes)
                    : null,
                note: draft.note.trim(),
              },
            ];
          }),
        },
      }),
    meta: { inlineError: true },
  });
  const dirty = JSON.stringify(drafts) !== JSON.stringify(initial);
  const unmarked = data.students.filter(
    (student) => !(drafts[student.id] ?? BLANK).meaning,
  );
  const invalid = Object.values(drafts).some((draft) => minutesIssue(draft));
  const set = (studentId: string, next: Draft) =>
    setDrafts((current) => ({ ...current, [studentId]: next }));
  const markRestPresent = () =>
    setDrafts((current) => {
      const next = { ...current };
      for (const student of unmarked)
        next[student.id] = {
          ...(current[student.id] ?? BLANK),
          meaning: "present",
        };
      return next;
    });
  const earlierOf = (studentId: string) =>
    data.earlier.filter((mark) => mark.studentId === studentId);
  const lateNow = () => {
    const start = data.period.startTime;
    if (data.date !== data.today || !start) return null;
    const clock = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: user.school.timeZone,
    }).format(new Date());
    return minutesLate(start, clock, data.lateness.afterMinutes);
  };
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid) return;
        void save.mutateAsync().then(
          async (result) => {
            toast.success(
              result.state === "submitted"
                ? m.attSubmittedToast()
                : m.attSavedToast(),
            );
            await queryClient.invalidateQueries({ queryKey: ["attendance"] });
          },
          () => undefined,
        );
      }}
    >
      {unmarked.length && editable ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
          <p className="text-sm leading-5">
            {m.attUnmarkedCount({ count: unmarked.length })}
          </p>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            disabled={!hydrated}
            onClick={markRestPresent}
          >
            <ListChecks aria-hidden />
            {m.attMarkRestPresent()}
          </Button>
        </div>
      ) : null}
      <section
        aria-label={m.attStudents()}
        className="rounded-lg border bg-card px-4"
      >
        <ul className="divide-y">
          {data.students.map((student) => (
            <StudentRow
              key={student.id}
              student={student}
              draft={drafts[student.id] ?? BLANK}
              earlier={earlierOf(student.id)}
              report={data.reports.find((row) => row.studentId === student.id)}
              movements={data.movements.filter(
                (row) => row.studentId === student.id,
              )}
              via={
                data.marks.find((mark) => mark.studentId === student.id)?.via ??
                null
              }
              reasons={data.reasons}
              lateNow={lateNow}
              closesMinutes={data.lateness.closesMinutes}
              disabled={!editable || !hydrated || save.isPending}
              onChange={(next) => set(student.id, next)}
            />
          ))}
        </ul>
      </section>
      {editable ? (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-background py-4 max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom))]">
          <Button
            type="submit"
            className="max-md:h-10"
            disabled={!hydrated || save.isPending || !dirty || invalid}
          >
            <Save aria-hidden />
            {unmarked.length
              ? m.attSaveProgress()
              : data.register?.state === "submitted"
                ? m.attSaveChanges()
                : m.attSubmit()}
          </Button>
          <Summary drafts={drafts} />
          {save.error ? (
            <p
              role="alert"
              className="basis-full text-[13px] leading-[18px] text-destructive"
            >
              {getMessageFromError(save.error)}
            </p>
          ) : null}
        </div>
      ) : null}
      <UnsavedChangesGuard isDirty={() => dirty} pending={save.isPending} />
    </form>
  );
}

export function Register({
  classId,
  date,
  periodId,
  onChange,
}: {
  classId: string;
  date: string;
  periodId: string;
  onChange: (change: { date?: string; periodId?: string }) => void;
}) {
  const data = useSuspenseQuery(registerQuery(classId, date, periodId)).data;
  const user = useCurrentUser();
  const [checking, setChecking] = useState(false);
  const state = data.register?.state ?? "not_started";
  const facts = [
    { label: m.attDate(), value: formatDay(data.date) },
    ...(data.register
      ? [
          {
            label: m.attLastSaved(),
            value: m.attSavedBy({
              name: inLocale(
                data.register.recordedByNameEn,
                data.register.recordedByNameAr,
              ),
              time: formatSavedAt(
                data.register.updatedAt,
                data.date,
                user.school.timeZone,
              ),
            }),
          },
        ]
      : []),
  ];
  const max = data.today < data.year.lastDay ? data.today : data.year.lastDay;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <RecordHeader
        title={classTitle(data.class)}
        facts={facts}
        status={{ label: STATE_LABEL[state](), tone: STATE_TONE[state] }}
        action={
          data.access.editable &&
          data.students.length > 0 &&
          (data.checkIn.touch || data.checkIn.qr || data.checkIn.nfc)
            ? {
                label: m.attCheckInOpen(),
                icon: MonitorSmartphone,
                onClick: () => setChecking(true),
              }
            : undefined
        }
      />
      {checking ? (
        <CheckInScreen
          classId={classId}
          date={data.date}
          periodId={data.period.id}
          onClose={() => setChecking(false)}
        />
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DayNav
          id="register-date"
          date={data.date}
          min={data.year.startsOn}
          max={max < data.date ? data.date : max}
          today={data.today}
          onChange={(next) => onChange({ date: next })}
        />
        <SelectField
          id="register-period"
          label={m.attPeriod()}
          labelHidden
          width="name"
          className="w-56"
          value={data.period.id}
          options={data.periods.map((period) => ({
            value: period.id,
            label: period.startTime
              ? m.attPeriodAt({
                  period: inLocale(period.nameEn, period.nameAr),
                  time: period.startTime,
                })
              : inLocale(period.nameEn, period.nameAr),
          }))}
          onChange={(next) => onChange({ periodId: next })}
        />
      </div>
      {data.access.editable ? null : (
        <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm leading-5">
          <CircleAlert
            className="mt-0.5 size-4 shrink-0 text-warning"
            aria-hidden
          />
          {ACCESS_NOTE[data.access.reason]()}
        </p>
      )}
      {data.students.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-sm leading-5 text-muted-foreground">
          {m.attNoStudents()}
        </p>
      ) : (
        <RegisterForm
          key={`${data.date}|${data.period.id}|${data.register?.version ?? 0}`}
          data={data}
        />
      )}
    </div>
  );
}
