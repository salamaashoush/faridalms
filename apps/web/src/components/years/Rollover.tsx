import type {
  NextYearIntention,
  NextYearOutcome,
  RolloverClass,
  RolloverPlan,
  RolloverQuery,
  RolloverStudent,
} from "@faridalms/domain/rollover";
import type { Tone } from "@faridalms/ui/system/status";

import {
  followsClass,
  NEXT_YEAR_INTENTIONS,
  rolloverPlanIssue,
} from "@faridalms/domain/rollover";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { cn } from "@faridalms/ui/cn";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { FormSection, RecordForm } from "@faridalms/ui/system/record-form";
import {
  Fact,
  Facts,
  phoneLink,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { classOptionsQuery } from "~/queries/classes";
import { rolloverQuery } from "~/queries/rollover";
import {
  applyRollover,
  openReenrolment,
  saveRollover,
  setIntention,
} from "~/server/rollover";
import { formatDate, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { classTitle } from "../classes/format";
import { displayName, labelOf } from "../people/format";
import { yearTitle } from "./format";
import { rolloverCarrierWords } from "./slots";

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

export interface RolloverProps {
  query: RolloverQuery;
  onClose: () => void;
}

export function Rollover({ query, onClose }: RolloverProps) {
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

interface RolloverAppliedProps {
  data: Data;
}

function RolloverApplied({ data }: RolloverAppliedProps) {
  const outcome = data.outcome;
  if (!outcome) return null;
  return (
    <Page width="form">
      <div className="grid gap-6">
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
    </Page>
  );
}

interface ClassRowProps {
  row: RolloverClass;
  source: Data["sources"][number] | undefined;
  /** How many of the class's students join it, as the plan decides them now. */
  following: number;
  data: Data;
  onChange: (change: Partial<RolloverClass>) => void;
}

function ClassRow({ row, source, following, data, onChange }: ClassRowProps) {
  const options = useSuspenseQuery(classOptionsQuery).data;
  const words = useSlot(rolloverCarrierWords).find(
    (each) => each.carrier === row.carrier,
  );
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
              label={words ? words.teacher() : m.classesTeacher()}
              optional
              value={row.teacherId || "none"}
              options={[
                ...options.teachers.map((teacher) => ({
                  value: teacher.id,
                  label: displayName(teacher),
                })),
                { value: "none", label: m.classesNoTeacherYet() },
              ]}
              onChange={(value) =>
                onChange({ teacherId: value === "none" ? "" : value })
              }
            />
          </div>
          {words ? (
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {words.describe(row)}
            </p>
          ) : (
            <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm leading-5 max-md:min-h-10">
              <Checkbox
                checked={row.students}
                onCheckedChange={(next) => onChange({ students: next })}
              />
              {m.rolloverStudentsFollow({
                count: following,
                value: formatNumber(following),
              })}
            </label>
          )}
        </>
      ) : (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.rolloverLeftOut()}
        </p>
      )}
    </fieldset>
  );
}

const INTENTION = {
  returning: {
    tone: "success",
    label: m.rolloverFamilyReturning,
    record: m.rolloverRecordReturning,
  },
  undecided: {
    tone: "neutral",
    label: m.rolloverFamilyUndecided,
    record: m.rolloverRecordUndecided,
  },
  leaving: {
    tone: "warning",
    label: m.rolloverFamilyLeaving,
    record: m.rolloverRecordLeaving,
  },
} satisfies Record<
  NextYearIntention,
  { tone: Tone; label: () => string; record: () => string }
>;

interface FamilyPlansProps {
  data: Data;
}

/**
 * Whether the families of the year are being asked about the next, and
 * what they answered so far; asking sends each deciding guardian a notice.
 */
function FamilyPlans({ data }: FamilyPlansProps) {
  const [confirming, setConfirming] = useState(false);
  const ask = useMutation({
    mutationFn: () => openReenrolment({ data: { yearId: data.source.id } }),
    meta: { inlineError: true },
  });
  const opened = data.source.reenrolmentOpenedAt;
  const count = (intention: NextYearIntention | null) =>
    data.students.filter((row) => row.intention === intention).length;
  return (
    <FormSection
      title={m.rolloverFamiliesTitle()}
      description={m.rolloverFamiliesHint({ year: yearTitle(data.target) })}
    >
      {opened ? (
        <p className="text-sm leading-5">
          {m.rolloverAskedOn({ date: formatDate(opened.slice(0, 10)) })}
          {" · "}
          {m.rolloverAnswers({
            returning: formatNumber(count("returning")),
            undecided: formatNumber(count("undecided")),
            leaving: formatNumber(count("leaving")),
            none: formatNumber(count(null)),
          })}
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start max-md:h-10"
          onClick={() => setConfirming(true)}
        >
          {m.rolloverAskFamilies()}
        </Button>
      )}
      {ask.error ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {getMessageFromError(ask.error)}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title={m.rolloverAskTitle({ year: yearTitle(data.target) })}
        body={m.rolloverAskBody()}
        confirmLabel={m.rolloverAskConfirm()}
        destructive={false}
        pending={ask.isPending}
        onConfirm={async () => {
          await ask.mutateAsync().catch(() => undefined);
          setConfirming(false);
        }}
        onCancel={() => setConfirming(false)}
      />
    </FormSection>
  );
}

interface StudentRowProps {
  student: Data["students"][number];
  row: RolloverStudent;
  targets: { value: string; label: string }[];
  /** Whether the family is being asked now, so the office may record its answer. */
  asking: boolean;
  onChange: (change: Partial<RolloverStudent>) => void;
}

function StudentRow({
  student,
  row,
  targets,
  asking,
  onChange,
}: StudentRowProps) {
  const name = displayName({
    fullNameEn: student.fullNameEn,
    fullNameAr: student.fullNameAr,
  });
  const leaving = !staying(row.outcome);
  const record = useMutation({
    mutationFn: (intention: NextYearIntention) =>
      setIntention({ data: { studentId: student.id, intention } }),
  });
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_12rem] sm:items-center sm:gap-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <bdi className="text-sm leading-5 font-medium">{name}</bdi>
          {student.intention ? (
            <StatusText tone={INTENTION[student.intention].tone}>
              {INTENTION[student.intention].label()}
            </StatusText>
          ) : null}
        </div>
        {asking ? (
          <ActionMenu
            label={m.rolloverAnswerFor({ name })}
            className="max-md:size-10"
            actions={NEXT_YEAR_INTENTIONS.map((intention) => ({
              label: INTENTION[intention].record(),
              onSelect: () => record.mutateAsync(intention),
            }))}
          />
        ) : null}
      </div>
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
      {targets.length > 0 ? (
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
      ) : null}
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

interface RolloverDraftProps {
  data: Data;
  query: RolloverQuery;
  onClose: () => void;
  confirming: boolean;
  setConfirming: (open: boolean) => void;
}

function RolloverDraft({
  data,
  query,
  onClose,
  confirming,
  setConfirming,
}: RolloverDraftProps) {
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
  const source = new Map(data.sources.map((row) => [row.id, row]));
  const outcomeOf = new Map(
    plan.students.map((row) => [row.studentId, row.outcome]),
  );
  const followerOf = (classId: string | null) =>
    plan.classes.find(
      (row) => row.include && row.carrier && row.sourceClassId === classId,
    )?.key ?? "";
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
    .filter((row) => row.include && row.carrier)
    .map((row) => ({
      value: row.key,
      label: inLocale(row.titleEn || null, row.titleAr || null) || row.code,
    }));
  const groups = [
    ...data.sources.map((row) => ({ id: row.id, title: classTitle(row) })),
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
        {data.state === "applied" ? null : <FamilyPlans data={data} />}
        {plan.classes.length > 0 ? (
          <FormSection
            title={m.rolloverClasses()}
            description={m.rolloverClassesHint()}
          >
            {plan.classes.map((row) => (
              <ClassRow
                key={row.key}
                row={row}
                source={source.get(row.sourceClassId)}
                following={
                  (source.get(row.sourceClassId)?.studentIds ?? []).filter(
                    (studentId) => followsClass(outcomeOf.get(studentId)),
                  ).length
                }
                data={data}
                onChange={(change) => setClass(row.key, change)}
              />
            ))}
          </FormSection>
        ) : null}
        <FormSection
          title={m.rolloverStudents()}
          description={m.rolloverStudentsHint({
            date: formatDate(data.target.startsOn),
          })}
        >
          {groups.length === 0 ? (
            <EmptyState placement="section" title={m.rolloverNoStudents()} />
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
                        asking={Boolean(data.source.reenrolmentOpenedAt)}
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
