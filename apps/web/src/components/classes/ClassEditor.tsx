import type { GridColumn, GridOption } from "@faridalms/ui/system/data-grid";

import { saveClassSchema } from "@faridalms/domain/classes";
import {
  DataGrid,
  GridAddButton,
  GridRemoveButton,
  SelectCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { FormSection, RecordForm } from "@faridalms/ui/system/record-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classOptionsQuery, classRecordQuery } from "~/queries/classes";
import { saveClass } from "~/server/classes";
import { refusalOf } from "~/utils/error";
import { schemaErrors } from "~/utils/validation";

import { displayName, labelOf } from "../people/format";

type ClassData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classRecordQuery>["queryFn"]>>
>;

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

function initialDraft(record: ClassData | null): Draft {
  if (!record)
    return {
      code: "",
      titleEn: "",
      titleAr: "",
      gradeId: "",
      locationId: "",
      homeroomTeacherId: "",
      subjects: [],
    };
  return {
    code: record.code,
    titleEn: record.titleEn ?? "",
    titleAr: record.titleAr ?? "",
    gradeId: record.gradeId ?? "",
    locationId: record.locationId ?? "",
    homeroomTeacherId: record.teachers[0]?.userId ?? "",
    subjects: record.subjects.map((subject, index) => ({
      key: index + 1,
      subjectId: subject.subjectId ?? "",
      teacherId: subject.teachers[0]?.userId ?? "",
    })),
  };
}

interface SubjectGridOptions {
  rows: SubjectDraft[];
  subjects: GridOption<string>[];
  teachers: GridOption<string>[];
  change: (key: number, next: Partial<SubjectDraft>) => void;
  remove: (key: number) => void;
}

// Built per render: headers read the request's locale.
function subjectGrid({
  rows,
  subjects,
  teachers,
  change,
  remove,
}: SubjectGridOptions) {
  const number = (row: SubjectDraft) => rows.indexOf(row) + 1;
  const rowHeader = {
    header: m.classesSubject(),
    cell: (row: SubjectDraft) => (
      <SelectCell
        id={`class-subject-${row.key}`}
        label={m.classesSubjectNumber({ number: number(row) })}
        value={row.subjectId}
        options={subjects}
        onChange={(subjectId) => change(row.key, { subjectId })}
      />
    ),
  };
  const columns: GridColumn<SubjectDraft>[] = [
    {
      id: "teacher",
      header: m.classesSubjectTeacher(),
      fill: true,
      cell: (row) => (
        <SelectCell
          id={`class-subject-teacher-${row.key}`}
          label={m.classesSubjectTeacherOf({ number: number(row) })}
          value={row.teacherId || "none"}
          options={teachers}
          onChange={(value) =>
            change(row.key, { teacherId: value === "none" ? "" : value })
          }
        />
      ),
    },
  ];
  const rowEnd = (row: SubjectDraft) => (
    <GridRemoveButton
      label={m.classesRemoveSubject({ number: number(row) })}
      onRemove={() => remove(row.key)}
    />
  );
  return { rowHeader, columns, rowEnd };
}

export interface ExistingClassEditorProps {
  id: string;
  onClose: () => void;
}

export function ExistingClassEditor({ id, onClose }: ExistingClassEditorProps) {
  const record = useSuspenseQuery(classRecordQuery(id)).data;
  return (
    <ClassEditor yearId={record.year.id} record={record} onClose={onClose} />
  );
}

export interface ClassEditorProps {
  yearId: string;
  record?: ClassData | null;
  onClose: () => void;
}

export function ClassEditor({
  yearId,
  record = null,
  onClose,
}: ClassEditorProps) {
  const options = useSuspenseQuery(classOptionsQuery).data;
  const queryClient = useQueryClient();
  const year = options.years.find((row) => row.id === yearId);
  const leaving = useRef(false);
  const nextKey = useRef((record?.subjects.length ?? 0) + 1);
  const focusLater = useFocusAfterRender();
  const [initial] = useState(() => initialDraft(record));
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
  const addSubject = (
    <GridAddButton
      label={m.classesAddSubject()}
      choices={subjectOptions.filter(
        (option) =>
          !draft.subjects.some((row) => row.subjectId === option.value),
      )}
      onAdd={(subjectId) => {
        if (!subjectId) return;
        const key = nextKey.current;
        nextKey.current += 1;
        set("subjects", [...draft.subjects, { key, subjectId, teacherId: "" }]);
        focusLater(`class-subject-teacher-${key}`);
      }}
    />
  );
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
    mutationFn: () => saveClass({ data: payload }),
    meta: { inlineError: true },
  });
  const validate = () =>
    schemaErrors(saveClassSchema, payload, (key) => FIELD_OF[key]);
  const refusal = refusalOf(mutation.error, FIELD_ERRORS);
  const failure = refusal && !refusal.field ? refusal.message : null;
  return (
    <RecordForm
      title={record ? m.classesEdit() : m.classesAdd()}
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
        {draft.subjects.length ? (
          <DataGrid<SubjectDraft>
            caption={m.classesSubjects()}
            editing
            surface="page"
            {...subjectGrid({
              rows: draft.subjects,
              subjects: subjectOptions,
              teachers: [...teachers, noTeacher],
              change: (key, next) =>
                set(
                  "subjects",
                  draft.subjects.map((item) =>
                    item.key === key ? { ...item, ...next } : item,
                  ),
                ),
              remove: (key) =>
                set(
                  "subjects",
                  draft.subjects.filter((item) => item.key !== key),
                ),
            })}
            groups={[{ id: "subjects", title: "", rows: draft.subjects }]}
            rowKey={(row) => String(row.key)}
            issues={
              errors.subjects && draft.subjects[0]
                ? [
                    {
                      target: `class-subject-${draft.subjects[0].key}`,
                      message: errors.subjects,
                    },
                  ]
                : []
            }
            footer={addSubject}
          />
        ) : (
          <div>{addSubject}</div>
        )}
      </FormSection>
    </RecordForm>
  );
}
