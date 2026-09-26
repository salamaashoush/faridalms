import type { SaveStudentInput } from "@faridalms/domain/administration-schema";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode, Ref } from "react";

import { saveStudentSchema } from "@faridalms/domain/administration-schema";
import { revalidateLogic, useForm, useStore } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { Suspense, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import type { StudentForm } from "~/components/records/StudentForms";
import type { getStudentForManagement } from "~/server/school";

import {
  prepareStudentSheet,
  StudentEditSheet,
} from "~/components/records/StudentForms";
import { TextField } from "~/components/system/field";
import { ManagementPickerField } from "~/components/system/ManagementPickerField";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import {
  managementOptionsQuery,
  studentManagementQuery,
  studentQuery,
} from "~/queries/school";
import { getStudentMatches, saveStudent } from "~/server/school";
import { formatList } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type ManagedStudent = Awaited<ReturnType<typeof getStudentForManagement>>;
type Match = Awaited<ReturnType<typeof getStudentMatches>>[number];

const EMPTY: SaveStudentInput = {
  reference: "",
  firstName: "",
  lastName: "",
  birthdate: "",
  classId: "",
  guardianIds: [],
  userId: "",
};

const ADD_ANOTHER = "add-another";
const FIRST_FIELD = "student-first-name";

/** Refusals from the server that are about one field, shown on that field. */
const FIELD_ERRORS: Record<string, keyof SaveStudentInput> = {
  "management.reference_conflict": "reference",
  "management.birthdate_future": "birthdate",
  "management.class_not_current": "classId",
  "management.parents_invalid": "guardianIds",
  "management.student_account_invalid": "userId",
  "management.account_linked": "userId",
};

/** The record as saveStudent takes it, without what is only shown beside it. */
function editable({
  account: _account,
  guardians: _guardians,
  ...record
}: ManagedStudent): SaveStudentInput {
  return record;
}

function ids(value: string | undefined) {
  return value ? [value] : [];
}

/** Null without a date of birth: the server matches on it and both names. */
function identity(value: SaveStudentInput) {
  return value.birthdate
    ? JSON.stringify([
        value.firstName.trim().toLowerCase(),
        value.lastName.trim().toLowerCase(),
        value.birthdate,
      ])
    : null;
}

/**
 * Students already recorded with the name and date of birth being added. The
 * form stops once to show them, and saving again adds the new student anyway,
 * since two children can share both.
 */
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
            <span className="min-w-0">
              <span dir="auto">{`${student.firstName} ${student.lastName}`}</span>
              <span className="text-muted-foreground">
                {" · "}
                <bdi dir="ltr">{student.reference}</bdi>
              </span>
            </span>
            <Link
              to="/students/$studentId"
              params={{ studentId: student.id }}
              className="font-medium text-primary underline underline-offset-2 max-md:inline-flex max-md:min-h-10 max-md:items-center"
            >
              {m.studentMatchesOpen()}
            </Link>
          </li>
        ))}
      </ul>
      <p className="ps-6 text-[13px] leading-[18px] text-muted-foreground">
        {m.studentMatchesSaveAgain()}
      </p>
    </div>
  );
}

/**
 * The pickers' first page of choices, so the form opens complete rather than
 * with its pickers still loading. An existing student's class and guardians
 * change through the record's own sheets, which need the record's profile.
 */
export async function prepareStudentEditor(
  queryClient: QueryClient,
  studentId: string | undefined,
) {
  const first = (
    kind: "classes" | "parents" | "students",
    selectedIds: string[],
  ) =>
    queryClient.prefetchQuery(
      managementOptionsQuery({ kind, q: "", selectedIds, studentId }),
    );
  if (!studentId) {
    await Promise.all([
      first("classes", []),
      first("parents", []),
      first("students", []),
    ]);
    return;
  }
  const [record] = await Promise.all([
    queryClient.ensureQueryData(studentManagementQuery(studentId)),
    queryClient.ensureQueryData(studentQuery({ studentId })),
  ]);
  await first("students", ids(record.userId));
}

export function ExistingStudentEditor({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { data } = useSuspenseQuery(studentManagementQuery(id));
  return (
    <StudentEditor studentId={id} initial={editable(data)} onClose={onClose} />
  );
}

/**
 * A value this form shows but does not change: moving a student and removing
 * a guardian each take the record's own confirmed steps.
 */
function Shown({
  label,
  action,
  children,
}: {
  label: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm leading-5 font-medium">{label}</legend>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <span className="min-w-0 text-sm leading-5">{children}</span>
        {action}
      </div>
    </fieldset>
  );
}

function CurrentClass({
  studentId,
  onMove,
}: {
  studentId: string;
  onMove: () => void;
}) {
  const { classId } = useSuspenseQuery(studentManagementQuery(studentId)).data;
  const { profile } = useSuspenseQuery(studentQuery({ studentId })).data;
  return (
    <Shown
      label={m.studentClass()}
      action={
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={onMove}
        >
          {m.studentMoveClass()}
        </Button>
      }
    >
      {classId && profile.className ? (
        <span dir="auto">{profile.className}</span>
      ) : (
        <span className="text-muted-foreground">{m.studentsNoClass()}</span>
      )}
    </Shown>
  );
}

function CurrentGuardians({
  studentId,
  onEdit,
}: {
  studentId: string;
  onEdit: () => void;
}) {
  const { guardians } = useSuspenseQuery(
    studentManagementQuery(studentId),
  ).data;
  return (
    <Shown
      label={m.studentGuardians()}
      action={
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={onEdit}
        >
          {m.studentEditGuardians()}
        </Button>
      }
    >
      {guardians.length ? (
        <span dir="auto">
          {formatList(guardians.map((guardian) => guardian.name))}
        </span>
      ) : (
        <span className="text-muted-foreground">
          {m.studentNoGuardiansShort()}
        </span>
      )}
    </Shown>
  );
}

export function StudentEditor({
  studentId,
  initial,
  onClose,
}: {
  studentId?: string;
  initial?: SaveStudentInput;
  onClose: () => void;
}) {
  const adding = !initial;
  const queryClient = useQueryClient();
  const intent = useRef<string | undefined>(undefined);
  const leaving = useRef(false);
  const [sheet, setSheet] = useState<{
    form: StudentForm;
    open: boolean;
    key: number;
  }>({ form: "class", open: false, key: 0 });
  // Save and add another asks for First name once the fields are enabled
  // again, which is only after the save has stopped pending.
  const [focusFirst, setFocusFirst] = useState(0);
  const focused = useRef(0);
  // A refused value stays marked on its field until the person changes it.
  const [refused, setRefused] = useState<{
    name: keyof SaveStudentInput;
    value: string;
    message: string;
  } | null>(null);
  const [matches, setMatches] = useState<{
    identity: string;
    students: Match[];
  } | null>(null);
  // The notice takes focus only when a save produced it. Focusing it on mount
  // would pull the caret out of a field the person is typing in.
  const notice = useRef<HTMLDivElement>(null);
  const [focusNotice, setFocusNotice] = useState(0);
  const noticeFocused = useRef(0);
  const [checking, setChecking] = useState(false);
  const mutation = useMutation({
    mutationFn: (data: SaveStudentInput) => saveStudent({ data }),
    meta: { inlineError: true },
  });
  const fieldOf = (error: unknown): keyof SaveStudentInput | undefined => {
    const name = error instanceof Error ? FIELD_ERRORS[error.message] : null;
    if (!name) return undefined;
    return adding || (name !== "classId" && name !== "guardianIds")
      ? name
      : undefined;
  };
  // Class and guardians are changed by the record's sheets while this form is
  // open, so saving sends them as they are now rather than as they loaded.
  const withPlacement = (value: SaveStudentInput): SaveStudentInput => {
    if (!studentId) return value;
    const current = queryClient.getQueryData(
      studentManagementQuery(studentId).queryKey,
    );
    return current
      ? { ...value, classId: current.classId, guardianIds: current.guardianIds }
      : value;
  };
  const form = useForm({
    defaultValues: initial ?? EMPTY,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: saveStudentSchema },
    onSubmit: async ({ value, formApi }) => {
      setRefused(null);
      const who = adding ? identity(value) : null;
      if (who && who !== matches?.identity) {
        setChecking(true);
        const students = await getStudentMatches({
          data: {
            firstName: value.firstName,
            lastName: value.lastName,
            birthdate: value.birthdate ?? "",
          },
        }).finally(() => setChecking(false));
        if (students.length) {
          setMatches({ identity: who, students });
          setFocusNotice((count) => count + 1);
          return;
        }
      }
      try {
        await mutation.mutateAsync(withPlacement(value));
      } catch (error) {
        const name = fieldOf(error);
        if (name)
          setRefused({
            name,
            value: JSON.stringify(value[name] ?? ""),
            message: getMessageFromError(error),
          });
        return;
      }
      if (adding && intent.current === ADD_ANOTHER) {
        toast.success(
          m.studentFormAdded({ name: `${value.firstName} ${value.lastName}` }),
        );
        // The next student often joins the same class. useForm passes its
        // defaultValues again on every render and puts them back on an
        // untouched form, so the reset must not replace them.
        formApi.reset(
          { ...EMPTY, classId: value.classId },
          { keepDefaultValues: true },
        );
        mutation.reset();
        setMatches(null);
        setFocusFirst((count) => count + 1);
        return;
      }
      leaving.current = true;
      toast.success(m.managementSaved());
      onClose();
    },
  });
  useEffect(() => {
    if (focusFirst === focused.current || mutation.isPending) return;
    focused.current = focusFirst;
    document.getElementById(FIRST_FIELD)?.focus();
  }, [focusFirst, mutation.isPending]);
  useEffect(() => {
    if (focusNotice === noticeFocused.current) return;
    noticeFocused.current = focusNotice;
    notice.current?.focus();
  }, [focusNotice]);
  const errorsFor = (
    name: keyof SaveStudentInput,
    value: unknown,
    errors: (string | { message?: string } | undefined)[],
  ) =>
    refused?.name === name && refused.value === JSON.stringify(value ?? "")
      ? [refused.message]
      : errors;
  const failure =
    mutation.error && !fieldOf(mutation.error)
      ? getMessageFromError(mutation.error)
      : null;
  const open = (which: StudentForm) => () => {
    if (!studentId) return;
    void prepareStudentSheet(queryClient, studentId, which).then(() =>
      setSheet((current) => ({
        form: which,
        open: true,
        key: current.key + 1,
      })),
    );
  };
  const accountEmpty = !initial?.userId;
  const entered = useStore(form.store, (state) => identity(state.values));
  // Matches belong to the name and date that were checked. Once either
  // changes they are dropped rather than hidden, so typing the same value back
  // neither brings the alert back mid-keystroke nor skips the next check.
  if (matches && matches.identity !== entered) setMatches(null);

  return (
    <>
      <RecordForm
        title={adding ? m.managementAddStudent() : m.managementEditStudent()}
        onSubmit={(submitter) => {
          intent.current = submitter;
          return form.handleSubmit();
        }}
        onCancel={onClose}
        isDirty={() => !leaving.current && form.state.isDirty}
        pending={mutation.isPending || checking}
        error={failure}
        secondary={
          adding
            ? { label: m.studentFormSaveAndAdd(), intent: ADD_ANOTHER }
            : undefined
        }
      >
        <FormSection title={m.studentPersonalDetails()}>
          <form.Field name="firstName">
            {(field) => (
              <TextField
                id={FIRST_FIELD}
                label={m.managementFirstName()}
                width="name"
                autoComplete="off"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="lastName">
            {(field) => (
              <TextField
                id="student-last-name"
                label={m.managementLastName()}
                width="name"
                autoComplete="off"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="reference">
            {(field) => (
              <TextField
                id="student-reference"
                label={m.familyReference()}
                width="reference"
                dir="ltr"
                autoComplete="off"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={errorsFor(
                  "reference",
                  field.state.value,
                  field.state.meta.errors,
                )}
              />
            )}
          </form.Field>
          <form.Field name="birthdate">
            {(field) => (
              <TextField
                id="student-birthdate"
                label={m.studentBirthdate()}
                optional
                type="date"
                width="date"
                value={field.state.value ?? ""}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={errorsFor(
                  "birthdate",
                  field.state.value,
                  field.state.meta.errors,
                )}
              />
            )}
          </form.Field>
          {matches ? (
            <Matches
              key={matches.identity}
              ref={notice}
              students={matches.students}
            />
          ) : null}
        </FormSection>
        <FormSection title={m.studentTabEnrollment()}>
          {studentId ? (
            <CurrentClass studentId={studentId} onMove={open("class")} />
          ) : (
            <form.Field name="classId">
              {(field) => (
                <ManagementPickerField
                  kind="classes"
                  label={m.studentClass()}
                  searchLabel={m.studentSearchClasses()}
                  emptyLabel={m.studentMoveChooseClass()}
                  optional
                  clearable
                  value={ids(field.state.value)}
                  onChange={(next) => field.handleChange(next[0] ?? "")}
                  errors={errorsFor(
                    "classId",
                    field.state.value,
                    field.state.meta.errors,
                  )}
                />
              )}
            </form.Field>
          )}
        </FormSection>
        <FormSection title={m.studentFormAccessSection()}>
          {studentId ? (
            <CurrentGuardians
              studentId={studentId}
              onEdit={open("guardians")}
            />
          ) : (
            <form.Field name="guardianIds">
              {(field) => (
                <ManagementPickerField
                  kind="parents"
                  label={m.studentGuardians()}
                  hint={m.studentGuardiansHint()}
                  searchLabel={m.studentSearchParents()}
                  emptyLabel={m.studentNoGuardiansShort()}
                  optional
                  multiple
                  value={field.state.value ?? []}
                  onChange={(next) => field.handleChange(next)}
                  errors={errorsFor(
                    "guardianIds",
                    field.state.value,
                    field.state.meta.errors,
                  )}
                />
              )}
            </form.Field>
          )}
          <form.Field name="userId">
            {(field) => (
              <ManagementPickerField
                kind="students"
                studentId={studentId}
                label={m.studentSignInAccount()}
                hint={m.studentAccountHint()}
                searchLabel={m.studentSearchAccounts()}
                emptyLabel={m.studentNoAccount()}
                // Unlinking a saved account is the record's own confirmed
                // action, so only a new link can be undone here.
                optional={accountEmpty}
                clearable={accountEmpty}
                value={ids(field.state.value)}
                onChange={(next) => field.handleChange(next[0] ?? "")}
                errors={errorsFor(
                  "userId",
                  field.state.value,
                  field.state.meta.errors,
                )}
              />
            )}
          </form.Field>
        </FormSection>
      </RecordForm>
      {/* Outside the form: a sheet's submit would otherwise bubble through
          React to this form's submit and save it too. */}
      {studentId ? (
        <Suspense fallback={null}>
          <StudentEditSheet
            key={sheet.key}
            studentId={studentId}
            form={sheet.form}
            open={sheet.open}
            onClose={() => setSheet((current) => ({ ...current, open: false }))}
          />
        </Suspense>
      ) : null}
    </>
  );
}
