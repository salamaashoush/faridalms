import type { ReactNode, Ref } from "react";

import { fullName, saveStudentSchema } from "@faridalms/domain/people";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { FormSection, RecordForm } from "@faridalms/ui/system/record-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { peopleOptionsQuery, studentRecordQuery } from "~/queries/students";
import { getStudentMatches, saveStudent } from "~/server/students";
import { refusalOf } from "~/utils/error";
import { schemaErrors } from "~/utils/validation";

import type { NamesDraft } from "./fields";

import {
  EMPTY_NAMES,
  hasName,
  NameFields,
  namesFrom,
  namesInput,
} from "./fields";
import { displayName, labelOf } from "./format";
import { studentEditorParts } from "./slots";

type Match = Awaited<ReturnType<typeof getStudentMatches>>[number];

interface Draft {
  names: NamesDraft;
  preferred: string;
  reference: string;
  birthDate: string;
  sexId: string;
  /** What modules keep about the student, by their keys. */
  parts: Record<string, unknown>;
}

const ADD_ANOTHER = "add-another";
const FIRST_FIELD = "student-ar-given";

/** Refusals from the server that are about one field, shown on that field. */
const FIELD_ERRORS: Partial<Record<string, keyof Draft>> = {
  "student.reference_taken": "reference",
  "user.birth_date_early": "birthDate",
};

function identity(draft: Draft) {
  return draft.birthDate && hasName(draft.names)
    ? JSON.stringify([namesInput(draft.names), draft.birthDate])
    : null;
}

interface MatchesProps {
  students: Match[];
  ref: Ref<HTMLDivElement>;
}

function Matches({ students, ref }: MatchesProps) {
  const titleId = useId();
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby={titleId}
      className="grid gap-2 rounded-lg border border-warning/60 bg-warning/10 p-4 outline-none focus-visible:ring-3 focus-visible:ring-warning/40"
    >
      <p
        id={titleId}
        className="flex items-start gap-2 text-sm leading-5 font-medium"
      >
        <TriangleAlert
          className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning"
          aria-hidden
        />
        {m.studentMatchesTitle()}
      </p>
      <ul className="grid gap-1.5 ps-6 text-sm leading-5">
        {students.map((student) => (
          <li
            key={student.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
          >
            <span dir="auto" className="min-w-0">
              {displayName(student)}
            </span>
            {student.atThisSchool ? (
              <Link
                to="/students/$studentId"
                params={{ studentId: student.id }}
                search={{}}
                className="font-medium text-primary underline underline-offset-2 max-md:inline-flex max-md:min-h-10 max-md:items-center"
              >
                {m.studentMatchesOpen()}
              </Link>
            ) : (
              <span className="text-muted-foreground">
                {m.studentMatchesOtherSchool()}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="ps-6 text-[13px] leading-[18px] text-muted-foreground">
        {m.studentMatchesSaveAgain()}
      </p>
    </div>
  );
}

function initialDraft(
  record: StudentRecordData | null,
  parts: Record<string, unknown>,
): Draft {
  return {
    names: record ? namesFrom(record) : EMPTY_NAMES,
    preferred: record?.preferredGivenName ?? "",
    reference: record?.reference ?? "",
    birthDate: record?.birthDate ?? "",
    sexId: record?.sexId ?? "",
    parts,
  };
}

type StudentRecordData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof studentRecordQuery>["queryFn"]>>
>;

export interface ExistingStudentEditorProps {
  id: string;
  onClose: () => void;
}

export function ExistingStudentEditor({
  id,
  onClose,
}: ExistingStudentEditorProps) {
  const record = useSuspenseQuery(studentRecordQuery(id)).data;
  return <StudentEditor record={record} onClose={onClose} />;
}

export interface StudentEditorProps {
  record?: StudentRecordData | null;
  onClose: () => void;
}

export function StudentEditor({ record = null, onClose }: StudentEditorProps) {
  const adding = record === null;
  const options = useSuspenseQuery(peopleOptionsQuery).data;
  const queryClient = useQueryClient();
  const intent = useRef<string | undefined>(undefined);
  const leaving = useRef(false);
  const parts = useSlot(studentEditorParts);
  const partReads = useSuspenseQueries({
    queries: parts.map((part) => part.query(record?.id ?? null)),
  });
  const startingParts = () =>
    Object.fromEntries(
      parts.map((part, index) => [
        part.key,
        part.initial(partReads[index]?.data),
      ]),
    );
  const [initial] = useState(() => initialDraft(record, startingParts()));
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>(
    {},
  );
  const [tried, setTried] = useState(false);
  const [matches, setMatches] = useState<{
    identity: string;
    students: Match[];
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [focusFirst, setFocusFirst] = useState(0);
  const focused = useRef(0);
  const notice = useRef<HTMLDivElement>(null);
  const [focusNotice, setFocusNotice] = useState(0);
  const noticeFocused = useRef(0);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setErrors((current) => ({ ...current, [key]: undefined }));
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const entered = identity(draft);
  if (matches && matches.identity !== entered) setMatches(null);
  useEffect(() => {
    if (focusFirst === focused.current) return;
    focused.current = focusFirst;
    document.getElementById(FIRST_FIELD)?.focus();
  }, [focusFirst]);
  useEffect(() => {
    if (focusNotice === noticeFocused.current) return;
    noticeFocused.current = focusNotice;
    notice.current?.focus();
  }, [focusNotice]);

  const payloadOf = (value: Draft) => ({
    ...(record ? { id: record.id, expectedVersion: record.version } : {}),
    names: namesInput(value.names),
    preferredName: value.preferred,
    reference: value.reference,
    birthDate: value.birthDate,
    sexId: value.sexId,
    parts: Object.fromEntries(
      parts.map((part) => [part.key, part.sent(value.parts[part.key])]),
    ),
  });
  const mutation = useMutation({
    mutationFn: (value: Draft) => saveStudent({ data: payloadOf(value) }),
    meta: { inlineError: true },
  });

  const validate = (value: Draft) =>
    schemaErrors(saveStudentSchema, payloadOf(value), (key) =>
      key === "names" || key === "reference" ? key : undefined,
    );
  const partProblem = (key: string) => {
    const part = parts.find((each) => each.key === key);
    return part ? part.problem(draft.parts[key]) : null;
  };

  const submit = async () => {
    const found = validate(draft);
    setErrors(found);
    setTried(true);
    if (
      Object.keys(found).length > 0 ||
      parts.some((part) => partProblem(part.key) !== null)
    )
      return;
    if (adding && entered && entered !== matches?.identity) {
      setChecking(true);
      const students = await getStudentMatches({
        data: { names: namesInput(draft.names), birthDate: draft.birthDate },
      }).finally(() => setChecking(false));
      if (students.length) {
        setMatches({ identity: entered, students });
        setFocusNotice((count) => count + 1);
        return;
      }
    }
    try {
      await mutation.mutateAsync(draft);
    } catch (error) {
      const refused = refusalOf(error, FIELD_ERRORS);
      if (refused?.field) setErrors({ [refused.field]: refused.message });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["people"] });
    if (adding && intent.current === ADD_ANOTHER) {
      const added = namesInput(draft.names);
      toast.success(
        m.studentFormAdded({
          name:
            fullName({
              given: added.ar.given ?? null,
              middle: added.ar.middle ?? null,
              family: added.ar.family ?? null,
            }) ??
            fullName({
              given: added.en.given ?? null,
              middle: added.en.middle ?? null,
              family: added.en.family ?? null,
            }) ??
            "",
        }),
      );
      setDraft(
        initialDraft(
          null,
          Object.fromEntries(
            parts.map((part) => [
              part.key,
              part.carried(draft.parts[part.key]),
            ]),
          ),
        ),
      );
      setTried(false);
      mutation.reset();
      setMatches(null);
      setFocusFirst((count) => count + 1);
      return;
    }
    leaving.current = true;
    toast.success(m.managementSaved());
    onClose();
  };

  const refusal = refusalOf(mutation.error, FIELD_ERRORS);
  const failure = refusal && !refusal.field ? refusal.message : null;

  return (
    <RecordForm
      title={adding ? m.managementAddStudent() : m.managementEditStudent()}
      onSubmit={(submitter) => {
        intent.current = submitter;
        return submit();
      }}
      onCancel={onClose}
      isDirty={() =>
        !leaving.current && JSON.stringify(draft) !== JSON.stringify(initial)
      }
      pending={mutation.isPending || checking}
      error={failure}
      secondary={
        adding
          ? { label: m.studentFormSaveAndAdd(), intent: ADD_ANOTHER }
          : undefined
      }
    >
      <FormSection title={m.studentPersonalDetails()}>
        <NameFields
          idPrefix="student"
          value={draft.names}
          onChange={(names) => set("names", names)}
          error={errors.names}
        />
        <TextField
          id="student-preferred"
          label={m.peoplePreferredName()}
          optional
          width="name"
          autoComplete="off"
          value={draft.preferred}
          onChange={(event) => set("preferred", event.target.value)}
        />
        <TextField
          id="student-reference"
          label={m.familyReference()}
          width="reference"
          dir="ltr"
          autoComplete="off"
          value={draft.reference}
          onChange={(event) => set("reference", event.target.value)}
          errors={errors.reference ? [errors.reference] : undefined}
        />
        <TextField
          id="student-birth-date"
          label={m.studentBirthdate()}
          optional
          type="date"
          width="date"
          value={draft.birthDate}
          onChange={(event) => set("birthDate", event.target.value)}
          errors={errors.birthDate ? [errors.birthDate] : undefined}
        />
        <SelectField
          id="student-sex"
          label={m.peopleSex()}
          optional
          value={draft.sexId || "none"}
          options={[
            ...options.sexes.map((row) => ({
              value: row.id,
              label: labelOf(row) ?? row.code,
            })),
            { value: "none", label: m.commonNotRecorded() },
          ]}
          onChange={(value) => set("sexId", value === "none" ? "" : value)}
          width="name"
        />
        {matches ? (
          <Matches
            key={matches.identity}
            ref={notice}
            students={matches.students}
          />
        ) : null}
      </FormSection>
      {parts.map((part, index) => (
        <FormSection key={part.key} title={part.title()}>
          <part.Field
            read={partReads[index]?.data}
            student={record ? { id: record.id, version: record.version } : null}
            value={draft.parts[part.key]}
            problem={tried ? partProblem(part.key) : null}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                parts: { ...current.parts, [part.key]: value },
              }))
            }
          />
        </FormSection>
      ))}
    </RecordForm>
  );
}

export interface ShownValueProps {
  label: string;
  link: { id: string; tab: "enrollment" | "family"; label: string };
  children: ReactNode;
}

/**
 * A value this form shows but does not change: a grade change and guardian
 * links each take the record's own confirmed steps.
 */
export function ShownValue({ label, link, children }: ShownValueProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm leading-5 font-medium">{label}</legend>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <span className="min-w-0 text-sm leading-5">{children}</span>
        <Link
          to="/students/$studentId"
          params={{ studentId: link.id }}
          search={{ tab: link.tab }}
          className="text-sm font-medium text-primary hover:underline max-md:inline-flex max-md:min-h-10 max-md:items-center"
        >
          {link.label}
        </Link>
      </div>
    </fieldset>
  );
}
