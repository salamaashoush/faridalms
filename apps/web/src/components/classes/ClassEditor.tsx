import { saveClassSchema } from "@faridalms/domain/classes";
import { Button } from "@faridalms/ui/button";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { FormSection, RecordForm } from "@faridalms/ui/system/record-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { ClassDaysValue } from "~/components/classes/ClassDays";

import {
  ClassDaysSection,
  ClassPartFields,
  useClassDays,
} from "~/components/classes/ClassDays";
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

interface Draft {
  code: string;
  titleEn: string;
  titleAr: string;
  subjectId: string;
  locationId: string;
  teacherIds: string[];
  startsOn: string;
  endsOn: string;
  /** What modules keep about the class, by their keys. */
  parts: Record<string, unknown>;
}

type Field = "code" | "titles" | "endsOn";

const FIELD_OF: Partial<Record<string, Field>> = {
  code: "code",
  titleEn: "titles",
  titleAr: "titles",
  endsOn: "endsOn",
};

/** Refusals from the server that are about one field, shown on that field. */
const FIELD_ERRORS: Partial<Record<string, Field>> = {
  "class.code_taken": "code",
  "validation.class_code": "code",
  "validation.ends_before_start": "endsOn",
};

const NONE = "none";

function initialDraft(record: ClassData | null, days: ClassDaysValue): Draft {
  return {
    ...days,
    code: record?.code ?? "",
    titleEn: record?.titleEn ?? "",
    titleAr: record?.titleAr ?? "",
    subjectId: record?.subjectId ?? "",
    locationId: record?.locationId ?? "",
    teacherIds:
      record?.teachers
        .filter((row) => row.role === "teacher")
        .map((row) => row.userId) ?? [],
  };
}

export interface ExistingClassEditorProps {
  id: string;
  search: Readonly<Record<string, unknown>>;
  onClose: () => void;
}

export function ExistingClassEditor({
  id,
  search,
  onClose,
}: ExistingClassEditorProps) {
  const record = useSuspenseQuery(classRecordQuery(id)).data;
  return <ClassEditor record={record} search={search} onClose={onClose} />;
}

export interface ClassEditorProps {
  record?: ClassData | null;
  /** The form's address, which may carry the view of a module it was opened from. */
  search: Readonly<Record<string, unknown>>;
  onClose: () => void;
}

/**
 * A class: its names and code, the days it runs, what it teaches if
 * anything, its room and teachers, and what modules keep about it.
 */
export function ClassEditor({
  record = null,
  search,
  onClose,
}: ClassEditorProps) {
  const options = useSuspenseQuery(classOptionsQuery).data;
  const queryClient = useQueryClient();
  const classDays = useClassDays(record, search, options.today);
  const leaving = useRef(false);
  const [initial] = useState(() => initialDraft(record, classDays.initial()));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setErrors((current) => ({
      ...current,
      ...(key === "code" ? { code: undefined } : {}),
      ...(key === "titleEn" || key === "titleAr" ? { titles: undefined } : {}),
      ...(key === "startsOn" || key === "endsOn" ? { endsOn: undefined } : {}),
    }));
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const teachers = options.teachers
    .toSorted((a, b) => Number(b.teaches) - Number(a.teaches))
    .map((row) => ({ value: row.id, label: displayName(row) }));
  const payload = {
    ...(record ? { id: record.id, expectedVersion: record.version } : {}),
    code: draft.code.trim(),
    startsOn: draft.startsOn,
    endsOn: draft.endsOn,
    parts: draft.parts,
    titleEn: draft.titleEn,
    titleAr: draft.titleAr,
    subjectId: draft.subjectId,
    locationId: draft.locationId,
    teacherIds: draft.teacherIds.filter(Boolean),
  };
  const mutation = useMutation({
    mutationFn: () => saveClass({ data: payload }),
    meta: { inlineError: true },
  });
  const validate = () =>
    schemaErrors(saveClassSchema, payload, (key) => FIELD_OF[key]);
  const refusal = refusalOf(mutation.error, FIELD_ERRORS);
  const failure = refusal && !refusal.field ? refusal.message : null;
  const offered = (index: number) =>
    teachers.filter(
      (option) =>
        option.value === draft.teacherIds[index] ||
        !draft.teacherIds.includes(option.value),
    );
  return (
    <RecordForm
      title={record ? m.classesEdit() : m.classesAdd()}
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
          id="class-subject"
          label={m.classesSubject()}
          optional
          value={draft.subjectId || NONE}
          options={[
            ...options.subjects.map((row) => ({
              value: row.id,
              label: labelOf(row) ?? row.code,
            })),
            { value: NONE, label: m.commonNotRecorded() },
          ]}
          onChange={(value) => set("subjectId", value === NONE ? "" : value)}
          width="name"
        />
        <ClassPartFields
          section="details"
          parts={classDays.parts}
          reads={classDays.reads}
          search={search}
          value={{
            startsOn: draft.startsOn,
            endsOn: draft.endsOn,
            parts: draft.parts,
          }}
          onChange={(days) => setDraft((current) => ({ ...current, ...days }))}
        />
        <SelectField
          id="class-room"
          label={m.classesRoom()}
          optional
          value={draft.locationId || NONE}
          options={[
            ...options.rooms.map((row) => ({
              value: row.id,
              label: inLocale(row.nameEn, row.nameAr) || row.code || "",
            })),
            { value: NONE, label: m.commonNotRecorded() },
          ]}
          onChange={(value) => set("locationId", value === NONE ? "" : value)}
          width="name"
        />
      </FormSection>
      <ClassDaysSection
        parts={classDays.parts}
        reads={classDays.reads}
        search={search}
        value={{
          startsOn: draft.startsOn,
          endsOn: draft.endsOn,
          parts: draft.parts,
        }}
        onChange={(days) => {
          setErrors((current) => ({ ...current, endsOn: undefined }));
          setDraft((current) => ({ ...current, ...days }));
        }}
        error={errors.endsOn}
      />
      <FormSection
        title={m.classesTeachers()}
        description={m.classesTeachersHint()}
      >
        {draft.teacherIds.map((teacherId, index) => (
          <div key={index} className="flex items-end gap-2">
            <SelectField
              id={`class-teacher-${index}`}
              label={
                index === 0
                  ? m.classesTeacher()
                  : m.classesCoTeacherNumbered({ number: index })
              }
              value={teacherId}
              options={offered(index)}
              onChange={(value) =>
                set(
                  "teacherIds",
                  draft.teacherIds.map((other, at) =>
                    at === index ? value : other,
                  ),
                )
              }
              width="name"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="max-md:size-10"
              aria-label={m.classesTeacherRemove({
                name:
                  teachers.find((option) => option.value === teacherId)
                    ?.label ?? "",
              })}
              onClick={() =>
                set(
                  "teacherIds",
                  draft.teacherIds.filter((_, at) => at !== index),
                )
              }
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
        {draft.teacherIds.length < 4 &&
        draft.teacherIds.length < teachers.length ? (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start max-md:h-10"
            onClick={() =>
              set("teacherIds", [
                ...draft.teacherIds,
                offered(draft.teacherIds.length)[0]?.value ?? "",
              ])
            }
          >
            <Plus aria-hidden />
            {m.classesTeacherAdd()}
          </Button>
        ) : null}
      </FormSection>
    </RecordForm>
  );
}
