import type {
  NextYearOutcome,
  RolloverClass,
  RolloverPlan,
  RolloverQuery,
  RolloverStudent,
} from "@faridalms/domain/rollover";

import { rolloverPlanIssue } from "@faridalms/domain/rollover";
import { Checkbox } from "@faridalms/ui/checkbox";
import { cn } from "@faridalms/ui/cn";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { formatDate } from "~/components/family/format";
import { SelectField, TextField } from "~/components/system/field";
import { PageHeader } from "~/components/system/IndexPage";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import {
  Fact,
  Facts,
  phoneLink,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classOptionsQuery } from "~/queries/classes";
import { rolloverQuery } from "~/queries/rollover";
import { applyRollover, saveRollover } from "~/server/rollover";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { classTitle } from "../classes/format";
import { displayName, labelOf } from "../people/format";
import { yearTitle } from "./format";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof rolloverQuery>["queryFn"]>>
>;

const OUTCOME_LABEL: Record<NextYearOutcome, () => string> = {
  promote: m.rolloverPromote,
  retain: m.rolloverRepeat,
  leave: m.rolloverLeave,
  graduate: m.rolloverGraduate,
};

const staying = (outcome: NextYearOutcome) =>
  outcome === "promote" || outcome === "retain";

function counts(plan: RolloverPlan) {
  const included = new Set(
    plan.classes.filter((row) => row.include).map((row) => row.key),
  );
  return {
    classes: included.size,
    placed: plan.students.filter(
      (row) => staying(row.outcome) && included.has(row.targetKey),
    ).length,
    left: plan.students.filter((row) => row.outcome === "leave").length,
    graduated: plan.students.filter((row) => row.outcome === "graduate").length,
  };
}

export function Rollover({
  query,
  onClose,
}: {
  query: RolloverQuery;
  onClose: () => void;
}) {
  const data = useSuspenseQuery(rolloverQuery(query)).data;
  // Saving changes the draft's version, which starts the draft afresh from
  // what was saved; the confirmation a save led to has to outlive that.
  const [confirming, setConfirming] = useState(false);
  if (data.state === "applied" && data.outcome)
    return <RolloverApplied data={data} />;
  return (
    <RolloverDraft
      key={`${data.version}-${data.state}`}
      data={data}
      query={query}
      onClose={onClose}
      confirming={confirming}
      setConfirming={setConfirming}
    />
  );
}

function RolloverApplied({ data }: { data: Data }) {
  const outcome = data.outcome;
  if (!outcome) return null;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader
        title={m.rolloverTitle({ target: yearTitle(data.target) })}
        description={m.rolloverAppliedSummary({
          source: yearTitle(data.source),
          classes: outcome.classes.length,
          placed: outcome.placed,
          left: outcome.left + outcome.graduated,
        })}
      />
      <RecordSection title={m.rolloverNewClasses()}>
        <RecordList>
          {outcome.classes.map((row) => (
            <li key={row.classId} className="py-3">
              <Link
                to="/classes/$classId"
                params={{ classId: row.classId }}
                search={{}}
                dir="ltr"
                className={cn(
                  "text-sm leading-5 font-medium hover:text-primary hover:underline",
                  phoneLink,
                )}
              >
                {row.code}
              </Link>
            </li>
          ))}
        </RecordList>
      </RecordSection>
    </div>
  );
}

function ClassRow({
  row,
  source,
  data,
  onChange,
}: {
  row: RolloverClass;
  source: Data["homerooms"][number] | undefined;
  data: Data;
  onChange: (change: Partial<RolloverClass>) => void;
}) {
  const options = useSuspenseQuery(classOptionsQuery).data;
  const name = source ? classTitle(source) : row.code;
  const taken = data.takenCodes.some(
    (code) => code.toLowerCase() === row.code.trim().toLowerCase(),
  );
  return (
    <fieldset className="grid gap-4 rounded-lg border p-4">
      <legend className="sr-only">{name}</legend>
      <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm leading-5 font-medium max-md:min-h-10">
        <Checkbox
          checked={row.include}
          onCheckedChange={(next) => onChange({ include: next })}
        />
        <span dir="auto">{m.rolloverFromClass({ name })}</span>
      </label>
      {row.include ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={`roll-code-${row.key}`}
              label={m.classesCode()}
              dir="ltr"
              width="full"
              maxLength={40}
              autoComplete="off"
              value={row.code}
              onChange={(event) => onChange({ code: event.target.value })}
              errors={taken ? [m.errorClassCodeTaken()] : undefined}
            />
            <SelectField
              id={`roll-grade-${row.key}`}
              label={m.studentGrade()}
              optional
              value={row.gradeId || "none"}
              options={[
                ...options.grades.map((grade) => ({
                  value: grade.id,
                  label: labelOf(grade) ?? grade.code,
                })),
                { value: "none", label: m.commonNotRecorded() },
              ]}
              onChange={(value) =>
                onChange({ gradeId: value === "none" ? "" : value })
              }
            />
            <TextField
              id={`roll-title-ar-${row.key}`}
              label={m.classesNameArabic()}
              dir="rtl"
              width="full"
              maxLength={120}
              autoComplete="off"
              value={row.titleAr}
              onChange={(event) => onChange({ titleAr: event.target.value })}
            />
            <TextField
              id={`roll-title-en-${row.key}`}
              label={m.classesNameEnglish()}
              dir="ltr"
              width="full"
              maxLength={120}
              autoComplete="off"
              value={row.titleEn}
              onChange={(event) => onChange({ titleEn: event.target.value })}
            />
            <SelectField
              id={`roll-teacher-${row.key}`}
              label={m.classesClassTeacher()}
              optional
              value={row.homeroomTeacherId || "none"}
              options={[
                ...options.teachers.map((teacher) => ({
                  value: teacher.id,
                  label: displayName(teacher),
                })),
                { value: "none", label: m.classesNoTeacherYet() },
              ]}
              onChange={(value) =>
                onChange({ homeroomTeacherId: value === "none" ? "" : value })
              }
            />
          </div>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.rolloverSubjectsCarry({ count: row.subjects.length })}
          </p>
        </>
      ) : (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.rolloverLeftOut()}
        </p>
      )}
    </fieldset>
  );
}

function StudentRow({
  student,
  row,
  targets,
  onChange,
}: {
  student: Data["students"][number];
  row: RolloverStudent;
  targets: { value: string; label: string }[];
  onChange: (change: Partial<RolloverStudent>) => void;
}) {
  const name = displayName({
    fullNameEn: student.fullNameEn,
    fullNameAr: student.fullNameAr,
  });
  const leaving = !staying(row.outcome);
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_12rem] sm:items-center sm:gap-3">
      <bdi className="text-sm leading-5 font-medium">{name}</bdi>
      <SelectField
        id={`roll-outcome-${student.id}`}
        label={m.rolloverDecisionFor({ name })}
        labelHidden
        value={row.outcome}
        options={(["promote", "retain", "leave", "graduate"] as const).map(
          (value) => ({ value, label: OUTCOME_LABEL[value]() }),
        )}
        onChange={(outcome) => onChange({ outcome })}
      />
      <SelectField
        id={`roll-target-${student.id}`}
        label={m.rolloverTargetFor({ name })}
        labelHidden
        disabled={leaving}
        value={leaving ? "none" : row.targetKey || "none"}
        options={[
          ...targets,
          {
            value: "none",
            label: leaving ? m.rolloverNoClass() : m.rolloverChooseClass(),
          },
        ]}
        onChange={(value) =>
          onChange({ targetKey: value === "none" ? "" : value })
        }
      />
    </li>
  );
}

const PLAN_MESSAGE: Record<string, () => string> = {
  "rollover.duplicate_class": m.rolloverDuplicateClass,
  "rollover.duplicate_code": m.rolloverDuplicateCode,
  "rollover.class_name": m.rolloverClassName,
  "rollover.duplicate_subject": m.rolloverDuplicateSubject,
  "rollover.duplicate_student": m.rolloverDuplicateStudent,
  "rollover.target_for_leaver": m.rolloverTargetForLeaver,
  "rollover.missing_target": m.rolloverMissingTarget,
};

function RolloverDraft({
  data,
  query,
  onClose,
  confirming,
  setConfirming,
}: {
  data: Data;
  query: RolloverQuery;
  onClose: () => void;
  confirming: boolean;
  setConfirming: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const leaving = useRef(false);
  const [baseline, setBaseline] = useState(data.plan);
  const [plan, setPlan] = useState(data.plan);
  const [version, setVersion] = useState(data.version);
  // A plan reconciled with today's placements on reading differs from the
  // one stored, so it is unsaved until saved again.
  const [reconciled, setReconciled] = useState(data.reconciled);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      saveRollover({ data: { ...query, expectedVersion: version, plan } }),
    meta: { inlineError: true },
  });
  const apply = useMutation({
    mutationFn: () =>
      applyRollover({ data: { ...query, expectedVersion: version } }),
    meta: { inlineError: true },
  });
  const source = new Map(data.homerooms.map((row) => [row.id, row]));
  const followerOf = (classId: string | null) =>
    plan.classes.find((row) => row.include && row.sourceClassId === classId)
      ?.key ?? "";
  const setClass = (key: string, change: Partial<RolloverClass>) => {
    setProblem(null);
    setPlan((current) => ({
      ...current,
      classes: current.classes.map((row) =>
        row.key === key ? { ...row, ...change } : row,
      ),
      students:
        change.include === false
          ? current.students.map((row) =>
              row.targetKey === key ? { ...row, targetKey: "" } : row,
            )
          : current.students,
    }));
  };
  const setStudent = (
    student: Data["students"][number],
    change: Partial<RolloverStudent>,
  ) => {
    setProblem(null);
    setPlan((current) => ({
      ...current,
      students: current.students.map((row) => {
        if (row.studentId !== student.id) return row;
        const next = { ...row, ...change };
        if (change.outcome && !staying(change.outcome)) next.targetKey = "";
        if (change.outcome === "promote" && !next.targetKey)
          next.targetKey = followerOf(student.classId);
        return next;
      }),
    }));
  };
  const targets = plan.classes
    .filter((row) => row.include)
    .map((row) => ({
      value: row.key,
      label: inLocale(row.titleEn || null, row.titleAr || null) || row.code,
    }));
  const groups = [
    ...data.homerooms.map((row) => ({ id: row.id, title: classTitle(row) })),
    { id: null, title: m.rolloverNotInClass() },
  ]
    .map((group) => ({
      ...group,
      students: data.students.filter((row) => row.classId === group.id),
    }))
    .filter((group) => group.students.length > 0);
  const planned = new Map(plan.students.map((row) => [row.studentId, row]));
  const total = counts(plan);
  const dirty = reconciled || JSON.stringify(plan) !== JSON.stringify(baseline);
  const takenCode = plan.classes.find(
    (row) =>
      row.include &&
      data.takenCodes.some(
        (code) => code.toLowerCase() === row.code.trim().toLowerCase(),
      ),
  );
  const failure =
    (data.issue ? getMessageFromError({ message: data.issue }) : null) ??
    problem ??
    (save.error ? getMessageFromError(save.error) : null);
  return (
    <>
      <RecordForm
        title={m.rolloverTitle({ target: yearTitle(data.target) })}
        description={m.rolloverHint({
          source: yearTitle(data.source),
          target: yearTitle(data.target),
        })}
        submitLabel={m.rolloverSavePlan()}
        secondary={{ label: m.rolloverReviewApply(), intent: "apply" }}
        onSubmit={async (intent) => {
          if (data.issue) return;
          const issue = rolloverPlanIssue(plan);
          if (issue) {
            setProblem(
              PLAN_MESSAGE[issue]?.() ??
                getMessageFromError({ message: issue }),
            );
            return;
          }
          if (intent === "apply" && takenCode) {
            setProblem(m.rolloverCodeTaken({ code: takenCode.code }));
            return;
          }
          if (dirty || version === 0) {
            let saved: { version: number };
            try {
              saved = await save.mutateAsync();
            } catch {
              return;
            }
            setVersion(saved.version);
            setBaseline(plan);
            setReconciled(false);
            await queryClient.invalidateQueries({ queryKey: ["years"] });
            toast.success(m.rolloverSaved());
          }
          if (intent === "apply") setConfirming(true);
        }}
        onCancel={onClose}
        isDirty={() => !leaving.current && dirty}
        pending={save.isPending}
        error={failure}
      >
        {reconciled ? (
          <p className="rounded-lg bg-muted p-3 text-sm leading-5">
            {m.rolloverReconciled()}
          </p>
        ) : null}
        <FormSection
          title={m.rolloverClasses()}
          description={m.rolloverClassesHint()}
        >
          {plan.classes.map((row) => (
            <ClassRow
              key={row.key}
              row={row}
              source={source.get(row.sourceClassId)}
              data={data}
              onChange={(change) => setClass(row.key, change)}
            />
          ))}
        </FormSection>
        <FormSection
          title={m.rolloverStudents()}
          description={m.rolloverStudentsHint({
            date: formatDate(data.target.startsOn),
          })}
        >
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {m.rolloverNoStudents()}
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.id ?? "none"} className="grid gap-1">
                <h3 className="flex items-baseline gap-2 text-sm leading-5 font-semibold">
                  <span dir="auto">{group.title}</span>
                  <span className="font-normal text-muted-foreground tabular-nums">
                    {formatNumber(group.students.length)}
                  </span>
                </h3>
                <RecordList>
                  {group.students.map((student) => {
                    const row = planned.get(student.id);
                    return row ? (
                      <StudentRow
                        key={student.id}
                        student={student}
                        row={row}
                        targets={targets}
                        onChange={(change) => setStudent(student, change)}
                      />
                    ) : null;
                  })}
                </RecordList>
              </section>
            ))
          )}
        </FormSection>
        <FormSection title={m.rolloverReview()}>
          <Facts>
            <Fact label={m.rolloverToCreate()}>
              {formatNumber(total.classes)}
            </Fact>
            <Fact label={m.rolloverPlaced()}>{formatNumber(total.placed)}</Fact>
            <Fact label={m.rolloverLeaving()}>{formatNumber(total.left)}</Fact>
            <Fact label={m.rolloverGraduating()}>
              {formatNumber(total.graduated)}
            </Fact>
          </Facts>
        </FormSection>
      </RecordForm>
      <SheetForm
        open={confirming}
        onOpenChange={(next) => setConfirming(next)}
        title={m.rolloverConfirmTitle({ target: yearTitle(data.target) })}
        submitLabel={m.rolloverApply()}
        pending={apply.isPending}
        error={apply.error ? getMessageFromError(apply.error) : null}
        onSubmit={async () => {
          await apply.mutateAsync().then(
            async () => {
              leaving.current = true;
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["years"] }),
                queryClient.invalidateQueries({ queryKey: ["classes"] }),
                queryClient.invalidateQueries({ queryKey: ["people"] }),
              ]);
              toast.success(m.rolloverApplied());
              setConfirming(false);
            },
            () => undefined,
          );
        }}
      >
        <p className="text-sm leading-5 text-muted-foreground">
          {m.rolloverConfirmHint({
            classes: total.classes,
            placed: total.placed,
            date: formatDate(data.target.startsOn),
            source: yearTitle(data.source),
          })}
        </p>
      </SheetForm>
    </>
  );
}
