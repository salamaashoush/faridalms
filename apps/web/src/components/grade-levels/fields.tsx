import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import {
  Fact,
  Facts,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import type { ClassEditorPartProps } from "~/components/classes/slots";
import type {
  StudentEditorPartProps,
  StudentPartProps,
} from "~/components/people/slots";
import type { GradeOptions } from "~/queries/grade-levels";

import { lastDay } from "~/components/people/format";
import { ShownValue } from "~/components/people/StudentEditor";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { gradeOptionsQuery, studentGradesQuery } from "~/queries/grade-levels";
import { setStudentGrade } from "~/server/grade-levels";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

import { useGradeWords } from "./words";

const NONE = "none";

/** A grade's name as the school gives it, or null for none. */
export function gradeName(options: GradeOptions, id: string | null) {
  const grade = options.grades.find((row) => row.id === id);
  return grade ? inLocale(grade.labelEn, grade.labelAr) || grade.code : null;
}

/** The grades a form offers: those still in use, and the one already chosen. */
export function gradeChoices(options: GradeOptions, chosen = "") {
  return options.grades
    .filter((row) => !row.retired || row.id === chosen)
    .map((row) => ({
      value: row.id,
      label: inLocale(row.labelEn, row.labelAr) || row.code,
    }));
}

const gradeIdOf = (value: unknown) =>
  typeof value === "object" && value && "gradeId" in value
    ? String(value.gradeId)
    : "";

/** What the class form reads for its grade: the school's grades and the class's own. */
export interface ClassGradeRead {
  options: GradeOptions;
  gradeId: string;
}

/** The grade a class teaches, on the class and homeroom forms. */
export function ClassGradeField({
  read,
  value,
  onChange,
}: ClassEditorPartProps) {
  const words = useGradeWords();
  const { options } = read as ClassGradeRead;
  const gradeId = gradeIdOf(value);
  return (
    <SelectField
      id="class-grade"
      label={words.grade()}
      optional
      value={gradeId || NONE}
      options={[
        ...gradeChoices(options, gradeId),
        { value: NONE, label: m.commonNotRecorded() },
      ]}
      onChange={(next) => onChange({ gradeId: next === NONE ? "" : next })}
      width="name"
    />
  );
}

/**
 * A student's grade on the student form: chosen for a new student from
 * today, shown for one already in the school, whose grade changes on
 * their record.
 */
export function StudentGradeField({
  student,
  value,
  onChange,
}: StudentEditorPartProps) {
  return student ? (
    <HeldGrade studentId={student.id} />
  ) : (
    <NewStudentGrade value={value} onChange={onChange} />
  );
}

interface NewStudentGradeProps {
  value: unknown;
  onChange: (value: unknown) => void;
}

function NewStudentGrade({ value, onChange }: NewStudentGradeProps) {
  const words = useGradeWords();
  const options = useSuspenseQuery(gradeOptionsQuery).data;
  const gradeId = gradeIdOf(value);
  return (
    <SelectField
      id="student-grade"
      label={words.grade()}
      optional
      hint={words.studentHint()}
      value={gradeId || NONE}
      options={[
        ...gradeChoices(options),
        { value: NONE, label: m.commonNotRecorded() },
      ]}
      onChange={(next) => onChange({ gradeId: next === NONE ? "" : next })}
      width="name"
    />
  );
}

interface HeldGradeProps {
  studentId: string;
}

function HeldGrade({ studentId }: HeldGradeProps) {
  const words = useGradeWords();
  const { rows, today } = useSuspenseQuery(studentGradesQuery(studentId)).data;
  const current = rows.find(
    (row) => row.from <= today && (row.until === null || today < row.until),
  );
  return (
    <ShownValue
      label={words.grade()}
      link={{ id: studentId, tab: "enrollment", label: words.change() }}
    >
      {current?.grade
        ? inLocale(current.grade.labelEn, current.grade.labelAr)
        : m.commonNotRecorded()}
    </ShownValue>
  );
}

/** A student's grade today, and a change of grade from a day for whoever keeps students. */
export function StudentGradeAside({ student, manage }: StudentPartProps) {
  const words = useGradeWords();
  const { rows, today } = useSuspenseQuery(studentGradesQuery(student.id)).data;
  const [sheet, setSheet] = useState({ open: false, key: 0 });
  const current = rows.find(
    (row) => row.from <= today && (row.until === null || today < row.until),
  );
  const next = rows.find((row) => row.from > today);
  return (
    <>
      <RecordSection
        title={words.grade()}
        edit={
          manage
            ? {
                label: words.change(),
                onClick: () =>
                  setSheet((value) => ({ open: true, key: value.key + 1 })),
              }
            : undefined
        }
      >
        <Facts>
          <Fact label={m.studentGradeNow()}>
            {current?.grade
              ? inLocale(current.grade.labelEn, current.grade.labelAr)
              : null}
          </Fact>
          {next?.grade ? (
            <Fact label={m.studentGradeNext({ date: formatDate(next.from) })}>
              {inLocale(next.grade.labelEn, next.grade.labelAr)}
            </Fact>
          ) : null}
        </Facts>
      </RecordSection>
      {sheet.open ? (
        <GradeSheet
          key={sheet.key}
          studentId={student.id}
          today={today}
          gradeId={current?.grade?.id ?? ""}
          onClose={() => setSheet((value) => ({ ...value, open: false }))}
        />
      ) : null}
    </>
  );
}

interface GradeSheetProps {
  studentId: string;
  today: string;
  gradeId: string;
  onClose: () => void;
}

/** Puts a student in a grade from a day; a change already set for later stands. */
function GradeSheet({ studentId, today, gradeId, onClose }: GradeSheetProps) {
  const words = useGradeWords();
  const inWords = useWords();
  const options = useSuspenseQuery(gradeOptionsQuery).data;
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState(gradeId);
  const [from, setFrom] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      setStudentGrade({ data: { studentId, gradeId: chosen, from } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={words.change()}
      pending={mutation.isPending}
      error={
        mutation.error ? getMessageFromError(mutation.error, inWords) : null
      }
      onSubmit={async () => {
        if (!chosen) {
          setError(m.validationSelection());
          return;
        }
        await mutation.mutateAsync().then(
          async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["grade-levels"] }),
              queryClient.invalidateQueries({ queryKey: ["people"] }),
            ]);
            toast.success(m.managementSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <SelectField
        id="sheet-grade"
        label={words.grade()}
        value={chosen}
        options={gradeChoices(options, chosen)}
        onChange={(next) => {
          setError(null);
          setChosen(next);
        }}
        errors={error ? [error] : undefined}
        width="name"
      />
      <TextField
        id="sheet-grade-from"
        label={m.studentGradeFrom()}
        type="date"
        width="date"
        value={from}
        onChange={(event) => setFrom(event.target.value)}
      />
    </SheetForm>
  );
}

/** A student's grades over time, below their classes. */
export function StudentGradeHistory({ student, today }: StudentPartProps) {
  const words = useGradeWords();
  const { rows } = useSuspenseQuery(studentGradesQuery(student.id)).data;
  return (
    <RecordSection title={words.history()}>
      {rows.length === 0 ? (
        <RecordEmpty>{words.historyEmpty()}</RecordEmpty>
      ) : (
        <RecordList>
          {rows.toReversed().map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3"
            >
              <span className="flex flex-wrap items-center gap-x-3 text-sm leading-5 font-medium">
                <Value>
                  {row.grade
                    ? inLocale(row.grade.labelEn, row.grade.labelAr)
                    : null}
                </Value>
                {row.from <= today &&
                (row.until === null || today < row.until) ? (
                  <StatusText tone="success">
                    {m.enrollmentCurrent()}
                  </StatusText>
                ) : null}
              </span>
              <span className="text-sm leading-5 text-muted-foreground">
                {row.until
                  ? m.studentGradeBetween({
                      from: formatDate(row.from),
                      to: formatDate(lastDay(row.until)),
                    })
                  : m.studentGradeSince({ from: formatDate(row.from) })}
              </span>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}
