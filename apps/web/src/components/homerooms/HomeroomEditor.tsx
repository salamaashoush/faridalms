import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { FieldOption } from "@faridalms/ui/system/form-field";
import type { ReactNode } from "react";

import { saveHomeroomSchema } from "@faridalms/domain/homerooms";
import { Button } from "@faridalms/ui/button";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { FormSection, RecordForm } from "@faridalms/ui/system/record-form";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Value } from "@faridalms/ui/system/value";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { displayName, labelOf } from "~/components/people/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classOptionsQuery, classRecordQuery } from "~/queries/classes";
import { homeroomOfClassQuery } from "~/queries/homerooms";
import { saveHomeroom } from "~/server/homerooms";
import { refusalOf } from "~/utils/error";
import { schemaErrors } from "~/utils/validation";

type ClassData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classRecordQuery>["queryFn"]>>
>;

interface HomeroomRecord {
  record: ClassData;
  subjects: { subjectId: string | null; teachers: { userId: string }[] }[];
}

interface SubjectDraft {
  key: number;
  subjectId: string;
  teacherId: string;
}

interface Draft {
  code: string;
  titleEn: string;
  titleAr: string;
  gradeId: string;
  locationId: string;
  homeroomTeacherId: string;
  subjects: SubjectDraft[];
}

type Field = "code" | "titles" | "subjects";

const FIELD_OF: Partial<Record<string, Field>> = {
  code: "code",
  titleEn: "titles",
  titleAr: "titles",
  subjects: "subjects",
};

/** Refusals from the server that are about one field, shown on that field. */
const FIELD_ERRORS: Partial<Record<string, Field>> = {
  "class.code_taken": "code",
  "validation.class_code": "code",
};

function initialDraft(homeroom: HomeroomRecord | null): Draft {
  if (!homeroom)
    return {
      code: "",
      titleEn: "",
      titleAr: "",
      gradeId: "",
      locationId: "",
      homeroomTeacherId: "",
      subjects: [],
    };
  const { record, subjects } = homeroom;
  return {
    code: record.code,
    titleEn: record.titleEn ?? "",
    titleAr: record.titleAr ?? "",
    gradeId: record.gradeId ?? "",
    locationId: record.locationId ?? "",
    homeroomTeacherId: record.teachers[0]?.userId ?? "",
    subjects: subjects.map((subject, index) => ({
      key: index + 1,
      subjectId: subject.subjectId ?? "",
      teacherId: subject.teachers[0]?.userId ?? "",
    })),
  };
}

interface SubjectChoices {
  subjects: FieldOption<string>[];
  teachers: FieldOption<string>[];
}

type SubjectRow = SubjectDraft & { id: string };

type SubjectOpener = (row: SubjectDraft) => ReactNode;

const NO_TEACHER = "none";

const optionLabel = (options: readonly FieldOption<string>[], value: string) =>
  options.find((option) => option.value === value)?.label ?? "";

// Built per render: headers read the request's locale.
function subjectColumns(
  choices: SubjectChoices,
  opener: SubjectOpener,
): Column<SubjectRow>[] {
  return [
    {
      id: "subject",
      header: m.classesSubject(),
      primary: true,
      cell: opener,
    },
    {
      id: "teacher",
      header: m.classesSubjectTeacher(),
      cell: (row) =>
        row.teacherId ? (
          optionLabel(choices.teachers, row.teacherId)
        ) : (
          <Value absent={m.classesNoTeacherYet()} />
        ),
    },
  ];
}

function subjectCard(choices: SubjectChoices, opener: SubjectOpener) {
  return {
    title: opener,
    fact: (row: SubjectDraft) =>
      row.teacherId
        ? optionLabel(choices.teachers, row.teacherId)
        : m.classesNoTeacherYet(),
  };
}

interface SubjectSheetProps {
  rows: SubjectDraft[];
  /** The subject being changed; none to add one. */
  row: SubjectDraft | null;
  choices: SubjectChoices;
  nextKey: () => number;
  open: boolean;
  onDone: (rows: SubjectDraft[]) => void;
  onClose: () => void;
}

/**
 * One subject of the class and who teaches it, kept with the class when it
 * is saved. Only subjects the class lacks are offered.
 */
function SubjectSheet({
  rows,
  row,
  choices,
  nextKey,
  open,
  onDone,
  onClose,
}: SubjectSheetProps) {
  const offered = choices.subjects.filter(
    (option) =>
      option.value === row?.subjectId ||
      !rows.some((other) => other.subjectId === option.value),
  );
  const [subjectId, setSubjectId] = useState(
    () => row?.subjectId ?? offered[0]?.value ?? "",
  );
  const [teacherId, setTeacherId] = useState(row?.teacherId ?? "");
  const [tried, setTried] = useState(false);
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        row
          ? m.classesSubjectEdit({
              subject: optionLabel(choices.subjects, row.subjectId),
            })
          : m.classesAddSubject()
      }
      submitLabel={row ? m.classesSubjectSave() : m.classesAddSubject()}
      onSubmit={() => {
        setTried(true);
        if (!subjectId) return;
        const next = { key: row?.key ?? nextKey(), subjectId, teacherId };
        onDone(
          row
            ? rows.map((other) => (other.key === row.key ? next : other))
            : [...rows, next],
        );
        onClose();
      }}
    >
      <SelectField
        id="class-subject"
        label={m.classesSubject()}
        value={subjectId}
        options={offered}
        onChange={setSubjectId}
        errors={tried && !subjectId ? [m.classesSubjectNeeded()] : undefined}
        width="name"
      />
      <SelectField
        id="class-subject-teacher"
        label={m.classesSubjectTeacher()}
        optional
        value={teacherId || NO_TEACHER}
        options={[
          ...choices.teachers,
          { value: NO_TEACHER, label: m.classesNoTeacherYet() },
        ]}
        onChange={(value) => setTeacherId(value === NO_TEACHER ? "" : value)}
        width="name"
      />
    </SheetForm>
  );
}

interface ClassSubjectsProps {
  rows: SubjectDraft[];
  choices: SubjectChoices;
  error?: string;
  nextKey: () => number;
  onChange: (rows: SubjectDraft[]) => void;
}

/** The class's subjects as a table, each opened and changed on its own. */
function ClassSubjects({
  rows,
  choices,
  error,
  nextKey,
  onChange,
}: ClassSubjectsProps) {
  const [sheet, setSheet] = useState<{
    row: SubjectDraft | null;
    key: number;
    open: boolean;
  } | null>(null);
  const open = (row: SubjectDraft | null) =>
    setSheet((current) => ({ row, key: (current?.key ?? 0) + 1, open: true }));
  const name = (row: SubjectDraft) =>
    optionLabel(choices.subjects, row.subjectId);
  const opener: SubjectOpener = (row) => (
    <RowButton onClick={() => open(row)}>{name(row)}</RowButton>
  );
  const add = (variant: "default" | "outline") =>
    rows.length < choices.subjects.length ? (
      <Button
        type="button"
        variant={variant}
        className="max-md:h-10"
        onClick={() => open(null)}
      >
        <Plus aria-hidden />
        {m.classesAddSubject()}
      </Button>
    ) : undefined;
  const rowActions = (row: SubjectDraft): RowAction[] => [
    { label: m.recordEdit(), icon: Pencil, onSelect: () => open(row) },
    {
      label: m.classesSubjectRemove(),
      icon: Trash2,
      destructive: true,
      confirm: {
        title: m.classesSubjectRemoveTitle({ subject: name(row) }),
        body: m.classesSubjectRemoveBody(),
        label: m.classesSubjectRemove(),
      },
      onSelect: () => onChange(rows.filter((other) => other.key !== row.key)),
    },
  ];
  return (
    <>
      <DataTable
        caption={m.classesSubjects()}
        rows={rows.map((row) => Object.assign({ id: String(row.key) }, row))}
        columns={subjectColumns(choices, opener)}
        rowLabel={name}
        rowActions={rowActions}
        actions={add("outline")}
        card={subjectCard(choices, opener)}
        empty={{ title: m.classesSubjectsNone(), action: add("outline") }}
      />
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-[13px] leading-[18px] text-destructive"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {sheet ? (
        <SubjectSheet
          key={sheet.key}
          rows={rows}
          row={sheet.row}
          choices={choices}
          nextKey={nextKey}
          open={sheet.open}
          onDone={onChange}
          onClose={() =>
            setSheet((current) => current && { ...current, open: false })
          }
        />
      ) : null}
    </>
  );
}

export interface ExistingHomeroomEditorProps {
  id: string;
  onClose: () => void;
}

export function ExistingHomeroomEditor({
  id,
  onClose,
}: ExistingHomeroomEditorProps) {
  const record = useSuspenseQuery(classRecordQuery(id)).data;
  const of = useSuspenseQuery(homeroomOfClassQuery(id)).data;
  return (
    <HomeroomEditor
      yearId={record.year.id}
      homeroom={{
        record,
        subjects: of.kind === "homeroom" ? of.subjects : [],
      }}
      onClose={onClose}
    />
  );
}

export interface HomeroomEditorProps {
  yearId: string;
  homeroom?: HomeroomRecord | null;
  onClose: () => void;
}

/** A homeroom with its class teacher and subjects, each subject a class taught to it. */
export function HomeroomEditor({
  yearId,
  homeroom = null,
  onClose,
}: HomeroomEditorProps) {
  const record = homeroom?.record ?? null;
  const options = useSuspenseQuery(classOptionsQuery).data;
  const queryClient = useQueryClient();
  const year = options.years.find((row) => row.id === yearId);
  const leaving = useRef(false);
  const nextKey = useRef((homeroom?.subjects.length ?? 0) + 1);
  const [initial] = useState(() => initialDraft(homeroom));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setErrors((current) => ({
      ...current,
      ...(key === "code" ? { code: undefined } : {}),
      ...(key === "titleEn" || key === "titleAr" ? { titles: undefined } : {}),
      ...(key === "subjects" ? { subjects: undefined } : {}),
    }));
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const teachers = options.teachers
    .toSorted((a, b) => Number(b.teaches) - Number(a.teaches))
    .map((row) => ({ value: row.id, label: displayName(row) }));
  const noTeacher = { value: "none", label: m.classesNoTeacherYet() };
  const subjectOptions = options.subjects.map((subject) => ({
    value: subject.id,
    label: labelOf(subject) ?? subject.code,
  }));
  const takeKey = () => {
    const key = nextKey.current;
    nextKey.current += 1;
    return key;
  };
  const payload = {
    ...(record ? { id: record.id, expectedVersion: record.version } : {}),
    yearId,
    code: draft.code.trim(),
    titleEn: draft.titleEn,
    titleAr: draft.titleAr,
    gradeId: draft.gradeId,
    locationId: draft.locationId,
    homeroomTeacherId: draft.homeroomTeacherId,
    subjects: draft.subjects
      .filter((row) => row.subjectId)
      .map((row) => ({
        subjectId: row.subjectId,
        teacherIds: row.teacherId ? [row.teacherId] : [],
      })),
  };
  const mutation = useMutation({
    mutationFn: () => saveHomeroom({ data: payload }),
    meta: { inlineError: true },
  });
  const validate = () =>
    schemaErrors(saveHomeroomSchema, payload, (key) => FIELD_OF[key]);
  const refusal = refusalOf(mutation.error, FIELD_ERRORS);
  const failure = refusal && !refusal.field ? refusal.message : null;
  return (
    <RecordForm
      title={record ? m.homeroomsEdit() : m.homeroomsAdd()}
      description={
        year
          ? m.classesInYear({ year: inLocale(year.titleEn, year.titleAr) })
          : undefined
      }
      onSubmit={async () => {
        const found = validate();
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        try {
          await mutation.mutateAsync();
        } catch (error) {
          const refused = refusalOf(error, FIELD_ERRORS);
          if (refused?.field) setErrors({ [refused.field]: refused.message });
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["classes"] });
        leaving.current = true;
        toast.success(m.managementSaved());
        onClose();
      }}
      onCancel={onClose}
      isDirty={() =>
        !leaving.current && JSON.stringify(draft) !== JSON.stringify(initial)
      }
      pending={mutation.isPending}
      error={failure}
    >
      <FormSection title={m.classesDetails()}>
        <TextField
          id="class-title-ar"
          label={m.classesNameArabic()}
          dir="rtl"
          width="name"
          maxLength={120}
          autoComplete="off"
          value={draft.titleAr}
          onChange={(event) => set("titleAr", event.target.value)}
          errors={errors.titles ? [errors.titles] : undefined}
        />
        <TextField
          id="class-title-en"
          label={m.classesNameEnglish()}
          dir="ltr"
          width="name"
          maxLength={120}
          autoComplete="off"
          value={draft.titleEn}
          onChange={(event) => set("titleEn", event.target.value)}
        />
        <TextField
          id="class-code"
          label={m.classesCode()}
          hint={m.classesCodeHint()}
          dir="ltr"
          width="reference"
          maxLength={40}
          autoComplete="off"
          value={draft.code}
          onChange={(event) => set("code", event.target.value)}
          errors={errors.code ? [errors.code] : undefined}
        />
        <SelectField
          id="class-grade"
          label={m.studentGrade()}
          optional
          value={draft.gradeId || "none"}
          options={[
            ...options.grades.map((row) => ({
              value: row.id,
              label: labelOf(row) ?? row.code,
            })),
            { value: "none", label: m.commonNotRecorded() },
          ]}
          onChange={(value) => set("gradeId", value === "none" ? "" : value)}
          width="name"
        />
        <SelectField
          id="class-room"
          label={m.classesRoom()}
          optional
          value={draft.locationId || "none"}
          options={[
            ...options.rooms.map((row) => ({
              value: row.id,
              label: inLocale(row.nameEn, row.nameAr) || row.code || "",
            })),
            { value: "none", label: m.commonNotRecorded() },
          ]}
          onChange={(value) => set("locationId", value === "none" ? "" : value)}
          width="name"
        />
        <SelectField
          id="class-teacher"
          label={m.classesClassTeacher()}
          hint={m.classesClassTeacherHint()}
          optional
          value={draft.homeroomTeacherId || "none"}
          options={[...teachers, noTeacher]}
          onChange={(value) =>
            set("homeroomTeacherId", value === "none" ? "" : value)
          }
          width="name"
        />
      </FormSection>
      <FormSection
        title={m.classesSubjects()}
        description={m.classesSubjectsHint()}
      >
        <ClassSubjects
          rows={draft.subjects}
          choices={{ subjects: subjectOptions, teachers }}
          error={errors.subjects}
          nextKey={takeKey}
          onChange={(subjects) => set("subjects", subjects)}
        />
      </FormSection>
    </RecordForm>
  );
}
