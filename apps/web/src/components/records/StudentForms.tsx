import type {
  ManagementOptionsInput,
  SaveStudentInput,
} from "@faridalms/domain/administration-schema";
import type { QueryClient } from "@tanstack/react-query";

import { saveStudentSchema } from "@faridalms/domain/administration-schema";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { getStudentForManagement } from "~/server/school";

import { formatDate } from "~/components/family/format";
import { ConfirmDialog } from "~/components/system/ConfirmDialog";
import { TextField } from "~/components/system/field";
import { ManagementPickerField } from "~/components/system/ManagementPickerField";
import { SheetForm } from "~/components/system/SheetForm";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import {
  managementOptionsQuery,
  studentManagementQuery,
  studentQuery,
} from "~/queries/school";
import { saveStudent } from "~/server/school";
import { formatList } from "~/utils/datetime";
import { getMessageFromError, MOVE_DATE_REGISTERS } from "~/utils/error";

export type StudentForm = "personal" | "class" | "guardians" | "account";

const REFERENCE_CONFLICT = "management.reference_conflict";
const MOVE_DATE_ERRORS = new Set([
  "management.move_date_future",
  "management.move_date_early",
]);

function isMoveDateError(error: unknown) {
  const code = errorCode(error) ?? "";
  return MOVE_DATE_ERRORS.has(code) || code.startsWith(MOVE_DATE_REGISTERS);
}

const personalSchema = v.pick(saveStudentSchema, [
  "firstName",
  "lastName",
  "reference",
  "birthdate",
]);

type ManagedStudent = Awaited<ReturnType<typeof getStudentForManagement>>;

/** The record as saveStudent takes it, without what is only shown beside it. */
function editable({
  account: _account,
  guardians: _guardians,
  ...record
}: ManagedStudent): SaveStudentInput {
  return record;
}

/**
 * The server saves a student as one record, so every section form sends the
 * whole record with only its own fields changed.
 */
function useSaveStudent(
  onSaved: () => void,
  message: () => string = m.managementSaved,
) {
  return useMutation({
    mutationFn: (data: SaveStudentInput) => saveStudent({ data }),
    meta: { inlineError: true },
    // Settled rather than success: the shared mutation cache refetches every
    // query first, so the sheet closes onto the saved values.
    onSettled: (_data, error) => {
      if (error) return;
      onSaved();
      toast.success(message());
    },
  });
}

function PersonalForm({
  record,
  open,
  onClose,
}: {
  record: SaveStudentInput;
  open: boolean;
  onClose: () => void;
}) {
  const mutation = useSaveStudent(onClose);
  // The reference another student holds, so the error stays on the field
  // until the person types a different one.
  const [takenReference, setTakenReference] = useState<string | null>(null);
  const defaultValues: v.InferInput<typeof personalSchema> = {
    firstName: record.firstName,
    lastName: record.lastName,
    reference: record.reference,
    birthdate: record.birthdate ?? "",
  };
  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: personalSchema },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync({ ...record, ...value });
      } catch (error) {
        // Every other failure is shown from mutation.error above the fields.
        if (errorCode(error) === REFERENCE_CONFLICT)
          setTakenReference(value.reference);
      }
    },
  });
  const conflict = errorCode(mutation.error) === REFERENCE_CONFLICT;
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.studentEditPersonal()}
      pending={mutation.isPending}
      error={
        mutation.error && !conflict ? getMessageFromError(mutation.error) : null
      }
      onSubmit={() => form.handleSubmit()}
    >
      <form.Field name="firstName">
        {(field) => (
          <TextField
            label={m.managementFirstName()}
            width="name"
            dir="auto"
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
            label={m.managementLastName()}
            width="name"
            dir="auto"
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
            label={m.familyReference()}
            width="reference"
            dir="ltr"
            autoComplete="off"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={
              field.state.value === takenReference
                ? [m.managementReferenceConflict()]
                : field.state.meta.errors
            }
          />
        )}
      </form.Field>
      <form.Field name="birthdate">
        {(field) => (
          <TextField
            label={m.studentBirthdate()}
            optional
            type="date"
            width="date"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>
    </SheetForm>
  );
}

function errorCode(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

const PICKERS = {
  guardians: {
    field: "guardianIds",
    kind: "parents",
    title: m.studentEditGuardians,
    label: m.studentGuardians,
    hint: m.studentGuardiansHint,
    search: m.studentSearchParents,
    empty: m.studentNoGuardiansShort,
  },
  account: {
    field: "userId",
    kind: "students",
    title: m.studentEditAccount,
    label: m.studentSignInAccount,
    hint: m.studentAccountHint,
    search: m.studentSearchAccounts,
    empty: m.studentNoAccount,
  },
} as const;

function initialPick(
  which: keyof typeof PICKERS,
  record: SaveStudentInput,
): string[] {
  return PICKERS[which].field === "guardianIds"
    ? (record.guardianIds ?? [])
    : [record.userId ?? ""].filter(Boolean);
}

/** The first page of choices a sheet's picker shows when it opens. */
function firstChoices(
  form: StudentForm,
  record: SaveStudentInput,
  studentId: string,
): ManagementOptionsInput | null {
  if (form === "personal") return null;
  if (form === "class")
    return { kind: "classes", q: "", selectedIds: [], studentId };
  return {
    kind: PICKERS[form].kind,
    q: "",
    selectedIds: initialPick(form, record),
    studentId,
  };
}

/**
 * Loads what a sheet shows before it opens. A picker still loading when the
 * sheet opens is not there to take focus, so focus would land on Save, and
 * Enter would save the record unchanged. A failure is left to the sheet,
 * which reports it where the picker would be.
 */
export async function prepareStudentSheet(
  queryClient: QueryClient,
  studentId: string,
  form: StudentForm,
) {
  try {
    const record = editable(
      await queryClient.ensureQueryData(studentManagementQuery(studentId)),
    );
    const choices = firstChoices(form, record, studentId);
    if (choices)
      await queryClient.ensureQueryData(managementOptionsQuery(choices));
  } catch {
    return;
  }
}

function PickerForm({
  form: which,
  studentId,
  record,
  guardians,
  open,
  onClose,
}: {
  form: keyof typeof PICKERS;
  studentId: string;
  record: SaveStudentInput;
  guardians: ManagedStudent["guardians"];
  open: boolean;
  onClose: () => void;
}) {
  const picker = PICKERS[which];
  const { profile } = useSuspenseQuery(studentQuery({ studentId })).data;
  const [value, setValue] = useState<string[]>(() =>
    initialPick(which, record),
  );
  const [confirming, setConfirming] = useState(false);
  const mutation = useSaveStudent(() => {
    setConfirming(false);
    onClose();
  });
  const save = () =>
    mutation.mutate({
      ...record,
      [picker.field]: picker.field === "guardianIds" ? value : (value[0] ?? ""),
    });
  const error = mutation.error ? getMessageFromError(mutation.error) : null;
  // Taking a guardian away is a removal, not an edit, so it asks first and
  // names who goes.
  const removed =
    picker.field === "guardianIds"
      ? guardians.filter((guardian) => !value.includes(guardian.id))
      : [];
  const removedNames = formatList(removed.map((guardian) => guardian.name));
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={picker.title()}
      pending={mutation.isPending}
      error={confirming ? null : error}
      onSubmit={() => (removed.length ? setConfirming(true) : save())}
    >
      <ManagementPickerField
        studentId={studentId}
        kind={picker.kind}
        label={picker.label()}
        hint={picker.hint()}
        searchLabel={picker.search()}
        emptyLabel={picker.empty()}
        optional
        multiple={picker.field === "guardianIds"}
        value={value}
        onChange={(next) => setValue(next)}
      />
      <ConfirmDialog
        open={confirming}
        title={m.studentRemoveGuardiansTitle({
          count: removed.length,
          guardians: removedNames,
          name: profile.fullName,
        })}
        body={
          value.length
            ? m.studentRemoveGuardiansKeptBody({
                count: removed.length,
                name: profile.fullName,
              })
            : m.studentRemoveGuardiansBody({ name: profile.fullName })
        }
        confirmLabel={m.studentRemoveGuardians({ count: removed.length })}
        pending={mutation.isPending}
        error={error ?? undefined}
        onConfirm={save}
        onCancel={() => {
          mutation.reset();
          setConfirming(false);
        }}
      />
    </SheetForm>
  );
}

/**
 * Choose the class and the day it takes effect, then check the move before it
 * happens: the old placement ends on that day and the new one starts on it.
 * Removing a student from every class is a separate action, so this form
 * always needs a class.
 */
function MoveClassForm({
  studentId,
  record,
  open,
  onClose,
}: {
  studentId: string;
  record: SaveStudentInput;
  open: boolean;
  onClose: () => void;
}) {
  const { today, profile } = useSuspenseQuery(studentQuery({ studentId })).data;
  const [target, setTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [step, setStep] = useState<"choose" | "check">("choose");
  const [missing, setMissing] = useState(false);
  const [on, setOn] = useState(today);
  const [dateChecked, setDateChecked] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const summaryId = useId();
  const summary = useRef<HTMLElement>(null);
  const chooser = useRef<HTMLDivElement>(null);
  const checked = useRef(false);
  const mutation = useSaveStudent(onClose, () =>
    m.studentMoved({ className: target?.name ?? "" }),
  );
  // Each step takes focus when it replaces the other, so a screen reader
  // hears the summary, and Change class lands back on the picker.
  useEffect(() => {
    if (step === "check") {
      checked.current = true;
      summary.current?.focus();
    } else if (checked.current) {
      chooser.current?.querySelector<HTMLElement>("[role=combobox]")?.focus();
    }
  }, [step]);
  const current = record.classId ? profile.className : null;
  const since = record.classId
    ? (profile.enrollmentHistory.find(
        (entry) =>
          entry.classId === record.classId &&
          entry.since <= today &&
          (entry.until === null || entry.until > today),
      )?.since ?? null)
    : null;
  const name = profile.fullName;
  const problem = !on
    ? m.studentMoveDateMissing()
    : on > today
      ? m.studentMoveDateFuture()
      : since && on < since
        ? m.studentMoveDateEarly({ date: formatDate(since) })
        : null;
  const dateIssue = dateError ?? (dateChecked ? problem : null);
  const failure = mutation.error;
  const check = () => {
    setMissing(!target);
    setDateChecked(true);
    if (target && !problem) setStep("check");
  };
  const move = (classId: string) =>
    mutation
      .mutateAsync({ ...record, classId, effectiveOn: on })
      .catch((error: unknown) => {
        // The date is on the first step, so a date the server refuses sends
        // the person back to it.
        if (!isMoveDateError(error)) return;
        setDateError(getMessageFromError(error));
        setStep("choose");
      });

  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.studentMoveClass()}
      submitLabel={
        step === "choose" ? m.studentMoveContinue() : m.studentMoveClass()
      }
      pending={mutation.isPending}
      error={
        failure && !isMoveDateError(failure)
          ? getMessageFromError(failure)
          : null
      }
      onSubmit={() => (step === "check" && target ? move(target.id) : check())}
    >
      {step === "choose" || !target ? (
        <div ref={chooser} className="grid gap-6">
          <ManagementPickerField
            studentId={studentId}
            kind="classes"
            label={m.studentMoveTarget()}
            hint={
              current
                ? m.studentMoveClassCurrent({ className: current })
                : m.studentMoveClassNone()
            }
            searchLabel={m.studentSearchClasses()}
            emptyLabel={m.studentMoveChooseClass()}
            exclude={record.classId}
            errors={missing ? [m.studentMoveChoose()] : undefined}
            value={target ? [target.id] : []}
            onChange={(ids, labels) => {
              const id = ids[0];
              setMissing(false);
              setTarget(id ? { id, name: labels[0] ?? "" } : null);
            }}
          />
          <TextField
            label={m.studentMoveDate()}
            hint={
              since
                ? m.studentMoveDateHint({ date: formatDate(since) })
                : m.studentMoveDateHintNone()
            }
            type="date"
            width="date"
            min={since ?? undefined}
            max={today}
            value={on}
            onChange={(event) => {
              setDateError(null);
              setOn(event.target.value);
            }}
            errors={dateIssue ? [dateIssue] : undefined}
          />
        </div>
      ) : (
        <section
          ref={summary}
          tabIndex={-1}
          aria-labelledby={summaryId}
          className="grid gap-6 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <h3 id={summaryId} className="text-sm leading-5 font-semibold">
            {m.studentMoveSummary()}
          </h3>
          <dl className="-mt-3 grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm leading-5">
            <dt className="text-muted-foreground">{m.roleStudent()}</dt>
            <dd>
              <span dir="auto">{name}</span>
            </dd>
            <dt className="text-muted-foreground">{m.studentMoveFrom()}</dt>
            <dd>
              {current ? (
                <span dir="auto">{current}</span>
              ) : (
                m.studentsNoClass()
              )}
            </dd>
            <dt className="self-center text-muted-foreground">
              {m.studentMoveTo()}
            </dt>
            <dd className="flex flex-wrap items-center gap-x-3">
              <span dir="auto" className="font-medium">
                {target.name}
              </span>
              <Button
                type="button"
                variant="link"
                className="h-auto px-0 max-md:min-h-10"
                onClick={() => setStep("choose")}
              >
                {m.studentMoveChangeClass()}
              </Button>
            </dd>
            <dt className="text-muted-foreground">{m.studentMoveStarts()}</dt>
            <dd>{formatDate(on)}</dd>
          </dl>
          <div className="grid gap-2">
            <h3 className="text-sm leading-5 font-semibold">
              {m.studentMoveImpactTitle()}
            </h3>
            <ul className="grid list-disc gap-1.5 ps-5 text-sm leading-5">
              <li>
                {m.studentMoveImpactJoin({
                  name,
                  className: target.name,
                  date: formatDate(on),
                })}
              </li>
              {current ? (
                <li>
                  {m.studentMoveImpactLeave({
                    className: current,
                    date: formatDate(on),
                  })}
                </li>
              ) : null}
            </ul>
          </div>
        </section>
      )}
    </SheetForm>
  );
}

/** Changes one part of the record from the record's menu, which confirms first. */
function useRecordChange(studentId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: SaveStudentInput) => saveStudent({ data }),
    meta: { inlineError: true },
  });
  return async (change: Partial<SaveStudentInput>) => {
    const record = editable(
      await queryClient.ensureQueryData(studentManagementQuery(studentId)),
    );
    await mutation.mutateAsync({ ...record, ...change });
  };
}

/** Ends the student's current placement without starting another. */
export function useRemoveFromClass(studentId: string) {
  const change = useRecordChange(studentId);
  return async (className: string) => {
    await change({ classId: "" });
    toast.success(m.studentRemovedFromClass({ className }));
  };
}

/** Detaches the sign-in account from the record, keeping the account itself. */
export function useUnlinkAccount(studentId: string) {
  const change = useRecordChange(studentId);
  return async (account: string) => {
    await change({ userId: "" });
    toast.success(m.studentAccountUnlinked({ account }));
  };
}

/**
 * Mounted afresh each time a sheet opens (the caller changes its key), so a
 * form always starts from the record as it is now rather than from what was
 * typed and cancelled last time.
 */
export function StudentEditSheet({
  studentId,
  form,
  open,
  onClose,
}: {
  studentId: string;
  form: StudentForm;
  open: boolean;
  onClose: () => void;
}) {
  const managed = useSuspenseQuery(studentManagementQuery(studentId)).data;
  const record = editable(managed);
  const props = { studentId, record, open, onClose };
  if (form === "personal")
    return <PersonalForm record={record} open={open} onClose={onClose} />;
  if (form === "class") return <MoveClassForm {...props} />;
  return <PickerForm form={form} guardians={managed.guardians} {...props} />;
}
