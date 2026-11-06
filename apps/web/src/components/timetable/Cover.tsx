import type { StaffAbsenceReason } from "@faridalms/domain/timetable";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";

import { STAFF_ABSENCE_REASONS } from "@faridalms/domain/timetable";
import { Button } from "@faridalms/ui/button";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { DataTable } from "@faridalms/ui/system/data-table";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarX2,
  CircleCheck,
  LoaderCircle,
  UserMinus,
  UserRoundPlus,
  UserX,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { classTitle } from "~/components/classes/format";
import { CheckboxRow } from "~/components/people/fields";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { coverDayQuery, coverOptionsQuery } from "~/queries/timetable";
import {
  changeLesson,
  endStaffAbsence,
  recordStaffAbsence,
  restoreLesson,
} from "~/server/timetable";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { periodName } from "./WeekGrid";

type Day = NonNullable<
  Awaited<
    ReturnType<NonNullable<ReturnType<typeof coverDayQuery>["queryFn"]>>
  >["cover"]
>;
type Lesson = Day["lessons"][number] & { id: string };
type Absence = Day["absences"][number];

const REASON_LABEL: Record<StaffAbsenceReason, () => string> = {
  illness: m.coverReasonIllness,
  training: m.coverReasonTraining,
  school_trip: m.coverReasonTrip,
  personal: m.coverReasonPersonal,
  other: m.coverReasonOther,
};

const nameOf = (en: string | null, ar: string | null) => inLocale(en, ar);

function lessonTitle(lesson: Lesson) {
  return classTitle({
    code: lesson.classCode,
    titleEn: lesson.classTitleEn,
    titleAr: lesson.classTitleAr,
  });
}

function roomOf(lesson: Lesson) {
  return lesson.roomId
    ? nameOf(lesson.roomNameEn, lesson.roomNameAr) || lesson.roomCode
    : null;
}

interface LessonStateProps {
  lesson: Lesson;
}

/** Where a lesson stands that day, as one short status. */
function LessonState({ lesson }: LessonStateProps) {
  const change = lesson.change;
  if (change?.cancelled)
    return <StatusText tone="neutral">{m.ttCancelled()}</StatusText>;
  if (change?.coverId)
    return (
      <StatusText tone="success">
        {m.ttCoveredBy({
          name: nameOf(change.coverNameEn, change.coverNameAr),
        })}
      </StatusText>
    );
  if (lesson.away)
    return <StatusText tone="warning">{m.coverNeeded()}</StatusText>;
  return <StatusText tone="info">{m.ttRoomChanged()}</StatusText>;
}

/** An absence's days and periods: "6 Oct", "6–8 Oct", with periods if partial. */
function absenceWhen(absence: Absence, periods: Day["periods"]) {
  const days =
    absence.from === absence.to
      ? formatDate(absence.from)
      : m.coverDays({
          from: formatDate(absence.from),
          to: formatDate(absence.to),
        });
  if (!absence.periodIds) return m.coverWholeDays({ days });
  const names = periods
    .filter((period) => absence.periodIds?.includes(period.id))
    .map((period) => periodName(period));
  return `${days} · ${names.join(", ")}`;
}

type Periods = Map<string, Day["periods"][number]>;

const stateOf = (row: Lesson) => <LessonState lesson={row} />;

function periodOf(periods: Periods, row: Lesson) {
  const period = periods.get(row.periodId);
  return period ? periodName(period) : "";
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function absenceColumns(periods: Day["periods"]): Column<Absence>[] {
  return [
    {
      id: "who",
      header: m.ttTeacher(),
      primary: true,
      cell: (row) => nameOf(row.fullNameEn, row.fullNameAr),
    },
    {
      id: "when",
      header: m.ttWhen(),
      cell: (row) => absenceWhen(row, periods),
    },
    {
      id: "reason",
      header: m.coverReason(),
      cell: (row) => REASON_LABEL[row.reason](),
    },
  ];
}

function absenceCard(periods: Day["periods"]) {
  return {
    title: (row: Absence) => nameOf(row.fullNameEn, row.fullNameAr),
    status: (row: Absence) => REASON_LABEL[row.reason](),
    fact: (row: Absence) => absenceWhen(row, periods),
  };
}

function lessonColumns(periods: Periods): Column<Lesson>[] {
  return [
    {
      id: "period",
      header: m.ttPeriod(),
      cell: (row) => periodOf(periods, row),
    },
    {
      id: "lesson",
      header: m.attClass(),
      primary: true,
      cell: (row) => lessonTitle(row),
    },
    {
      id: "teacher",
      header: m.ttTeacher(),
      cell: (row) => nameOf(row.teacherNameEn, row.teacherNameAr) || "–",
    },
    {
      id: "room",
      header: m.ttRoom(),
      cell: (row) => {
        const moved = row.change?.roomId ? row.change : null;
        return moved
          ? nameOf(moved.roomNameEn, moved.roomNameAr) || moved.roomCode
          : (roomOf(row) ?? "–");
      },
    },
    { id: "state", header: m.attStatus(), cell: stateOf },
  ];
}

function lessonCard(periods: Periods) {
  return {
    title: lessonTitle,
    status: stateOf,
    fact: (row: Lesson) =>
      [periodOf(periods, row), nameOf(row.teacherNameEn, row.teacherNameAr)]
        .filter(Boolean)
        .join(" · "),
  };
}

/** Why a candidate suits the lesson, and how much cover they carry already. */
function suitability(candidate: {
  knowsClass: boolean;
  sameSubject: boolean;
  covers: number;
  lessonsThatDay: number;
}) {
  return [
    candidate.knowsClass ? m.coverKnowsClass() : null,
    candidate.sameSubject ? m.coverSameSubject() : null,
    m.coverCount({ count: candidate.covers }),
    m.coverLessonsToday({ count: candidate.lessonsThatDay }),
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface CoverDayProps {
  on: string;
}

/**
 * A day's cover: who is away, then the lessons they leave and every lesson
 * changed for the day, each arranged in a panel with the best cover first.
 */
export function CoverDay({ on }: CoverDayProps) {
  const data = useSuspenseQuery(coverDayQuery(on)).data.cover;
  const queryClient = useQueryClient();
  const endAbsence = useServerFn(endStaffAbsence);
  const [adding, setAdding] = useState(false);
  const [arranging, setArranging] = useState<Lesson | null>(null);
  if (!data) return <EmptyState icon={CalendarX2} title={m.ttNoYear()} />;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["timetable"] });
  const periods: Periods = new Map(
    data.periods.map((period) => [period.id, period]),
  );
  const lessons: Lesson[] = data.lessons.map((lesson) => ({
    ...lesson,
    id: `${lesson.classId}:${lesson.periodId}`,
  }));
  const open = lessons.filter((lesson) => lesson.away && !lesson.change).length;

  const absenceActions = (row: Absence): RowAction[] => [
    {
      label: m.coverEndAbsence(),
      icon: UserX,
      destructive: true,
      confirm: {
        title: m.coverEndAbsenceTitle(),
        body: m.coverEndAbsenceBody({
          name: nameOf(row.fullNameEn, row.fullNameAr),
        }),
        label: m.coverEndAbsence(),
      },
      onSelect: async () => {
        await endAbsence({ data: { id: row.id } });
        await refresh();
      },
    },
  ];

  const lessonActions = (row: Lesson): RowAction[] => [
    {
      label: m.coverArrange(),
      icon: UserRoundPlus,
      inline: true,
      onSelect: () => setArranging(row),
    },
  ];

  return (
    <div className="grid gap-8">
      <section aria-labelledby="cover-away" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="cover-away" className="text-base leading-6 font-semibold">
            {m.coverAway()}
          </h2>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => setAdding(true)}
          >
            <UserMinus aria-hidden />
            {m.coverAddAbsence()}
          </Button>
        </div>
        <DataTable
          caption={m.coverAway()}
          rows={data.absences}
          columns={absenceColumns(data.periods)}
          rowLabel={(row) => nameOf(row.fullNameEn, row.fullNameAr)}
          rowActions={absenceActions}
          card={absenceCard(data.periods)}
          empty={{
            icon: CircleCheck,
            title: m.coverNobodyAway(),
            description: m.coverNobodyAwayBody(),
          }}
        />
      </section>
      <section aria-labelledby="cover-lessons" className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="cover-lessons" className="text-base leading-6 font-semibold">
            {m.coverLessons()}
          </h2>
          {lessons.length > 0 ? (
            <p
              aria-live="polite"
              className="text-sm leading-5 text-muted-foreground"
            >
              {open > 0
                ? m.coverStillOpen({ count: open })
                : m.coverAllArranged()}
            </p>
          ) : null}
        </div>
        <DataTable
          caption={m.coverLessons()}
          rows={lessons}
          columns={lessonColumns(periods)}
          rowLabel={(row) => lessonTitle(row)}
          rowActions={lessonActions}
          card={lessonCard(periods)}
          empty={{
            icon: CalendarX2,
            title: m.coverNoLessons(),
            description: m.coverNoLessonsBody(),
          }}
        />
      </section>
      <AbsenceSheet
        key={adding ? "open" : "closed"}
        open={adding}
        day={data.on}
        teachers={data.teachers}
        periods={data.periods}
        onClose={() => setAdding(false)}
        onSaved={refresh}
      />
      {arranging ? (
        <ArrangeSheet
          lesson={arranging}
          on={data.on}
          title={`${lessonTitle(arranging)} · ${periodOf(periods, arranging)}`}
          onClose={() => setArranging(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

interface AbsenceSheetProps {
  open: boolean;
  day: string;
  teachers: Day["teachers"];
  periods: Day["periods"];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}

function AbsenceSheet({
  open,
  day,
  teachers,
  periods,
  onClose,
  onSaved,
}: AbsenceSheetProps) {
  const record = useServerFn(recordStaffAbsence);
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState(day);
  const [to, setTo] = useState(day);
  const [wholeDay, setWholeDay] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState<StaffAbsenceReason>("illness");
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      record({
        data: {
          userId,
          from,
          to,
          periodIds: wholeDay ? [] : picked,
          reason,
          note,
        },
      }),
    onSuccess: async () => {
      toast.success(m.coverAbsenceSaved());
      await onSaved();
      onClose();
    },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.coverAddAbsence()}
      submitLabel={m.coverRecordAbsence()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={() => {
        if (!userId || (!wholeDay && picked.length === 0)) {
          setMissing(true);
          return;
        }
        save.mutate();
      }}
    >
      <SelectField
        id="absence-teacher"
        label={m.ttTeacher()}
        value={userId}
        options={teachers.map((row) => ({
          value: row.userId,
          label: nameOf(row.fullNameEn, row.fullNameAr),
        }))}
        onChange={setUserId}
        errors={missing && !userId ? [m.coverChooseTeacher()] : undefined}
      />
      <div className="flex flex-wrap gap-4">
        <TextField
          id="absence-from"
          type="date"
          label={m.coverFrom()}
          width="date"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
            if (event.target.value > to) setTo(event.target.value);
          }}
        />
        <TextField
          id="absence-to"
          type="date"
          label={m.coverTo()}
          width="date"
          min={from}
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </div>
      <CheckboxRow
        label={m.coverWholeDay()}
        hint={m.coverWholeDayHint()}
        checked={wholeDay}
        onChange={setWholeDay}
      />
      {wholeDay ? null : (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm leading-5 font-medium">
            {m.coverPeriods()}
          </legend>
          {periods.map((period) => (
            <CheckboxRow
              key={period.id}
              label={periodName(period)}
              checked={picked.includes(period.id)}
              onChange={(on) =>
                setPicked((current) =>
                  on
                    ? [...current, period.id]
                    : current.filter((id) => id !== period.id),
                )
              }
            />
          ))}
          {missing && picked.length === 0 ? (
            <p className="text-[13px] leading-[18px] text-destructive">
              {m.coverChoosePeriods()}
            </p>
          ) : null}
        </fieldset>
      )}
      <SelectField
        id="absence-reason"
        label={m.coverReason()}
        hint={m.coverReasonHint()}
        value={reason}
        options={STAFF_ABSENCE_REASONS.map((value) => ({
          value,
          label: REASON_LABEL[value](),
        }))}
        onChange={setReason}
      />
      <FormField id="absence-note" label={m.coverNote()} optional>
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

const KEEP = "";
const CANCEL = "cancel";

interface ArrangeSheetProps {
  lesson: Lesson;
  on: string;
  title: string;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}

/**
 * Arranges one lesson for its day: a cover teacher from those free then,
 * best first; another room; or no lesson at all.
 */
function ArrangeSheet({
  lesson,
  on,
  title,
  onClose,
  onSaved,
}: ArrangeSheetProps) {
  const options = useQuery(
    coverOptionsQuery({
      classId: lesson.classId,
      periodId: lesson.periodId,
      on,
    }),
  );
  const change = useServerFn(changeLesson);
  const restore = useServerFn(restoreLesson);
  const [cover, setCover] = useState(
    lesson.change?.cancelled ? CANCEL : (lesson.change?.coverId ?? KEEP),
  );
  const [roomId, setRoomId] = useState(lesson.change?.roomId ?? KEEP);
  const [note, setNote] = useState(lesson.change?.note ?? "");
  const cancelled = cover === CANCEL;
  const key = {
    classId: lesson.classId,
    periodId: lesson.periodId,
    on,
    expected: lesson.change?.id ?? "",
  };
  const save = useMutation({
    mutationFn: () =>
      cover === KEEP && roomId === KEEP
        ? restore({ data: key })
        : change({
            data: {
              ...key,
              coverId: cancelled ? "" : cover,
              roomId: cancelled ? "" : roomId,
              cancelled,
              note,
            },
          }),
    onSuccess: async () => {
      toast.success(m.coverSaved());
      await onSaved();
      onClose();
    },
  });
  const candidates = options.data?.candidates ?? [];
  const rooms = (options.data?.rooms ?? []).toSorted(
    (a, b) => Number(b.free) - Number(a.free),
  );
  return (
    <SheetForm
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={() => save.mutate()}
    >
      <p className="-mt-2 text-sm leading-5 text-muted-foreground">
        {m.coverPlanned({
          teacher: nameOf(lesson.teacherNameEn, lesson.teacherNameAr) || "–",
          room: roomOf(lesson) ?? "–",
        })}
      </p>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm leading-5 font-medium">
          {m.coverWho()}
        </legend>
        {options.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            {m.coverFinding()}
          </p>
        ) : (
          <RadioGroup
            value={cover}
            onValueChange={(value: string) => setCover(value)}
            className="gap-1"
          >
            <label
              htmlFor="cover-keep"
              className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
            >
              <RadioGroupItem id="cover-keep" value={KEEP} className="mt-0.5" />
              <span className="text-sm leading-5">{m.coverNobody()}</span>
            </label>
            {candidates.map((candidate) => (
              <label
                key={candidate.userId}
                htmlFor={`cover-${candidate.userId}`}
                className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
              >
                <RadioGroupItem
                  id={`cover-${candidate.userId}`}
                  value={candidate.userId}
                  className="mt-0.5"
                />
                <span className="grid gap-0.5">
                  <span className="text-sm leading-5 font-medium">
                    {nameOf(candidate.fullNameEn, candidate.fullNameAr)}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {suitability(candidate)}
                  </span>
                </span>
              </label>
            ))}
            {candidates.length === 0 ? (
              <p className="px-2 text-sm text-muted-foreground">
                {m.coverNobodyFree()}
              </p>
            ) : null}
            <label
              htmlFor="cover-cancel"
              className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
            >
              <RadioGroupItem
                id="cover-cancel"
                value={CANCEL}
                className="mt-0.5"
              />
              <span className="grid gap-0.5">
                <span className="text-sm leading-5 font-medium">
                  {m.coverCancel()}
                </span>
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {m.coverCancelHint()}
                </span>
              </span>
            </label>
          </RadioGroup>
        )}
      </fieldset>
      {cancelled ? null : (
        <SelectField
          id="cover-room"
          label={m.ttRoom()}
          value={roomId}
          options={[
            { value: KEEP, label: m.coverKeepRoom() },
            ...rooms.map((room) => ({
              value: room.id,
              label: room.free
                ? inLocale(room.nameEn, room.nameAr) || (room.code ?? "")
                : m.coverRoomBusy({
                    room:
                      inLocale(room.nameEn, room.nameAr) || (room.code ?? ""),
                  }),
            })),
          ]}
          onChange={setRoomId}
        />
      )}
      {cancelled ? null : (
        <FormField
          id="cover-note"
          label={m.coverNoteForCover()}
          hint={m.coverNoteHint()}
          optional
        >
          {(control) => (
            <Textarea
              {...control}
              dir="auto"
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </FormField>
      )}
    </SheetForm>
  );
}
