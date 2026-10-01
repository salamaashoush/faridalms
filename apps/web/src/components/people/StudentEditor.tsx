import type { ReactNode, Ref } from "react";

import { fullName } from "@faridalms/domain/people";
import { Button } from "@faridalms/ui/button";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { SelectField, TextField } from "~/components/system/field";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import * as m from "~/i18n/messages";
import { peopleOptionsQuery, studentRecordQuery } from "~/queries/students";
import {
  findGuardians,
  getStudentMatches,
  saveStudent,
} from "~/server/students";
import { formatList } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { FlagsDraft, NamesDraft } from "./fields";

import {
  EMPTY_NAMES,
  hasName,
  NameFields,
  namesFrom,
  namesInput,
  PARENT_FLAGS,
  RelationshipFields,
} from "./fields";
import { displayName, labelOf } from "./format";

type Match = Awaited<ReturnType<typeof getStudentMatches>>[number];
type Found = Awaited<ReturnType<typeof findGuardians>>[number];

interface GuardianDraft {
  key: number;
  phone: string;
  email: string;
  found: Found[] | null;
  choice: string;
  names: NamesDraft;
  flags: FlagsDraft;
}

interface Draft {
  names: NamesDraft;
  preferred: string;
  reference: string;
  birthDate: string;
  sexId: string;
  gradeId: string;
  guardians: GuardianDraft[];
}

const ADD_ANOTHER = "add-another";
const FIRST_FIELD = "student-ar-given";

/** Refusals from the server that are about one field, shown on that field. */
const FIELD_ERRORS: Record<string, keyof Draft> = {
  "external_id.taken": "reference",
  "users.invalid": "birthDate",
};

function identity(draft: Draft) {
  return draft.birthDate && hasName(draft.names)
    ? JSON.stringify([namesInput(draft.names), draft.birthDate])
    : null;
}

function Matches({
  students,
  ref,
}: {
  students: Match[];
  ref: Ref<HTMLDivElement>;
}) {
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

function GuardianBlock({
  draft,
  index,
  relations,
  onChange,
  onRemove,
  nameError,
}: {
  draft: GuardianDraft;
  index: number;
  relations: { value: string; label: string }[];
  onChange: (draft: GuardianDraft) => void;
  onRemove: () => void;
  nameError?: string | null;
}) {
  const [looking, setLooking] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const legendId = useId();
  const prefix = `guardian-${draft.key}`;
  const lookUp = async () => {
    if (!draft.phone.trim() && !draft.email.trim()) {
      setContactError(m.guardianContactRequired());
      return;
    }
    setContactError(null);
    setLooking(true);
    try {
      const found = await findGuardians({
        data: { phone: draft.phone, email: draft.email },
      });
      onChange({ ...draft, found, choice: found[0]?.id ?? "new" });
    } finally {
      setLooking(false);
    }
  };
  return (
    <fieldset
      aria-labelledby={legendId}
      className="grid gap-6 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <legend id={legendId} className="text-sm leading-5 font-semibold">
          {m.guardianNumbered({ number: index + 1 })}
        </legend>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={m.guardianRemoveDraft({ number: index + 1 })}
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          id={`${prefix}-phone`}
          label={m.familyMobile()}
          type="tel"
          dir="ltr"
          width="phone"
          autoComplete="off"
          value={draft.phone}
          onChange={(event) =>
            onChange({ ...draft, phone: event.target.value, found: null })
          }
          errors={contactError ? [contactError] : undefined}
        />
        <Button
          type="button"
          variant="outline"
          disabled={looking}
          onClick={() => void lookUp()}
        >
          {m.guardianFind()}
        </Button>
      </div>
      <TextField
        id={`${prefix}-email`}
        label={m.studentEmail()}
        type="email"
        dir="ltr"
        optional
        width="name"
        autoComplete="off"
        value={draft.email}
        onChange={(event) =>
          onChange({ ...draft, email: event.target.value, found: null })
        }
      />
      {draft.found && draft.found.length > 0 ? (
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm leading-5 font-medium">
            {m.guardianMatches()}
          </legend>
          <RadioGroup
            value={draft.choice}
            onValueChange={(next) =>
              onChange({ ...draft, choice: String(next) })
            }
          >
            {draft.found.map((match) => (
              <label
                key={match.id}
                className="flex items-center gap-3 text-sm leading-5"
              >
                <RadioGroupItem value={match.id} />
                <span dir="auto">{displayName(match)}</span>
                {match.birthYear ? (
                  <span className="text-muted-foreground">
                    {match.birthYear}
                  </span>
                ) : null}
              </label>
            ))}
            <label className="flex items-center gap-3 text-sm leading-5">
              <RadioGroupItem value="new" />
              {m.guardianSomeoneElse()}
            </label>
          </RadioGroup>
        </fieldset>
      ) : null}
      {draft.choice === "new" ? (
        <NameFields
          idPrefix={prefix}
          value={draft.names}
          onChange={(names) => onChange({ ...draft, names })}
          error={nameError}
        />
      ) : null}
      <RelationshipFields
        idPrefix={prefix}
        value={draft.flags}
        onChange={(flags) => onChange({ ...draft, flags })}
        relations={relations}
      />
    </fieldset>
  );
}

function initialDraft(record: StudentRecordData | null): Draft {
  return {
    names: record ? namesFrom(record) : EMPTY_NAMES,
    preferred: record?.preferredGivenName ?? "",
    reference: record?.reference ?? "",
    birthDate: record?.birthDate ?? "",
    sexId: record?.sexId ?? "",
    gradeId: "",
    guardians: [],
  };
}

type StudentRecordData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof studentRecordQuery>["queryFn"]>>
>;

export function ExistingStudentEditor({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const record = useSuspenseQuery(studentRecordQuery(id)).data;
  return <StudentEditor record={record} onClose={onClose} />;
}

export function StudentEditor({
  record = null,
  onClose,
}: {
  record?: StudentRecordData | null;
  onClose: () => void;
}) {
  const adding = record === null;
  const options = useSuspenseQuery(peopleOptionsQuery).data;
  const queryClient = useQueryClient();
  const relations = options.relations.map((row) => ({
    value: row.id,
    label: labelOf(row) ?? row.code,
  }));
  const motherId =
    options.relations.find((row) => row.code === "mother")?.id ?? "";
  const nextKey = useRef(1);
  const intent = useRef<string | undefined>(undefined);
  const leaving = useRef(false);
  const [initial] = useState(() => initialDraft(record));
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<
    Partial<Record<keyof Draft | `guardian-${number}`, string>>
  >({});
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

  const mutation = useMutation({
    mutationFn: (value: Draft) =>
      saveStudent({
        data: {
          ...(record ? { id: record.id, expectedVersion: record.version } : {}),
          names: namesInput(value.names),
          preferredName: value.preferred,
          reference: value.reference,
          birthDate: value.birthDate,
          sexId: value.sexId,
          gradeId: adding ? value.gradeId : "",
          guardians: adding
            ? value.guardians.map((guardian) =>
                guardian.choice === "new"
                  ? {
                      person: {
                        names: namesInput(guardian.names),
                        phone: guardian.phone,
                        email: guardian.email,
                      },
                      flags: guardian.flags,
                    }
                  : { existingUserId: guardian.choice, flags: guardian.flags },
              )
            : [],
        },
      }),
    meta: { inlineError: true },
  });

  const validate = (value: Draft) => {
    const found: typeof errors = {};
    if (!hasName(value.names)) found.names = m.validationNameRequired();
    if (!value.reference.trim()) found.reference = m.validationRequired();
    else if (!/^[A-Za-z0-9/_-]+$/.test(value.reference.trim()))
      found.reference = m.validationReference();
    value.guardians.forEach((guardian, index) => {
      if (guardian.choice === "new" && !hasName(guardian.names))
        found[`guardian-${index}`] = m.validationNameRequired();
    });
    return found;
  };

  const submit = async () => {
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
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
      const field =
        error instanceof Error ? FIELD_ERRORS[error.message] : undefined;
      if (field) setErrors({ [field]: getMessageFromError(error) });
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
      // The next student often joins the same grade.
      setDraft({ ...initialDraft(null), gradeId: draft.gradeId });
      mutation.reset();
      setMatches(null);
      setFocusFirst((count) => count + 1);
      return;
    }
    leaving.current = true;
    toast.success(m.managementSaved());
    onClose();
  };

  const failure =
    mutation.error &&
    !(mutation.error instanceof Error && FIELD_ERRORS[mutation.error.message])
      ? getMessageFromError(mutation.error)
      : null;
  const guardianNames =
    record?.guardians?.map((guardian) => displayName(guardian)) ?? [];

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
      <FormSection title={m.studentTabEnrollment()}>
        {adding ? (
          <SelectField
            id="student-grade"
            label={m.studentGrade()}
            optional
            hint={m.studentGradeHint()}
            value={draft.gradeId || "none"}
            options={[
              ...options.grades.map((row) => ({
                value: row.id,
                label: labelOf(row) ?? row.code,
              })),
              { value: "none", label: m.studentNotPlacedYet() },
            ]}
            onChange={(value) => set("gradeId", value === "none" ? "" : value)}
            width="name"
          />
        ) : (
          <ShownValue
            label={m.studentGrade()}
            link={{
              id: record.id,
              tab: "enrollment",
              label: m.studentChangeGrade(),
            }}
          >
            {record.placement
              ? labelOf(
                  options.grades.find(
                    (row) => row.id === record.placement?.gradeId,
                  ) ?? null,
                )
              : m.studentStatusUnplaced()}
          </ShownValue>
        )}
      </FormSection>
      <FormSection title={m.studentGuardians()}>
        {adding ? (
          <>
            {draft.guardians.map((guardian, index) => (
              <GuardianBlock
                key={guardian.key}
                draft={guardian}
                index={index}
                relations={relations}
                nameError={errors[`guardian-${index}`]}
                onChange={(next) =>
                  set(
                    "guardians",
                    draft.guardians.map((row) =>
                      row.key === guardian.key ? next : row,
                    ),
                  )
                }
                onRemove={() =>
                  set(
                    "guardians",
                    draft.guardians.filter((row) => row.key !== guardian.key),
                  )
                }
              />
            ))}
            <Button
              type="button"
              variant="outline"
              className="justify-self-start max-md:h-10"
              onClick={() => {
                const key = nextKey.current;
                nextKey.current += 1;
                set("guardians", [
                  ...draft.guardians,
                  {
                    key,
                    phone: "",
                    email: "",
                    found: null,
                    choice: "new",
                    names: EMPTY_NAMES,
                    flags: {
                      ...PARENT_FLAGS,
                      primaryContact: draft.guardians.length === 0,
                      relationId: motherId,
                    },
                  },
                ]);
              }}
            >
              <Plus aria-hidden />
              {draft.guardians.length
                ? m.guardianAddAnother()
                : m.guardianAdd()}
            </Button>
          </>
        ) : (
          <ShownValue
            label={m.studentGuardians()}
            link={{
              id: record.id,
              tab: "family",
              label: m.studentEditGuardians(),
            }}
          >
            {guardianNames.length ? (
              <span dir="auto">{formatList(guardianNames)}</span>
            ) : (
              <span className="text-muted-foreground">
                {m.studentNoGuardiansShort()}
              </span>
            )}
          </ShownValue>
        )}
      </FormSection>
    </RecordForm>
  );
}

/**
 * A value this form shows but does not change: a grade change and guardian
 * links each take the record's own confirmed steps.
 */
function ShownValue({
  label,
  link,
  children,
}: {
  label: string;
  link: { id: string; tab: "enrollment" | "family"; label: string };
  children: ReactNode;
}) {
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
