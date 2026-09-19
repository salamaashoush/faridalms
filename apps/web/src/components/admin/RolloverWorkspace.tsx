import type {
  RolloverClass,
  RolloverDecision,
  RolloverPlan,
} from "@faridalms/domain/rollover";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ButtonLink } from "~/components/app/ButtonLink";
import { subjectLabel } from "~/components/family/format";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import * as m from "~/i18n/messages";
import { applyRollover, saveRollover } from "~/server/rollover";
import { getMessageFromError } from "~/utils/error";

import { STAGE_LABEL } from "./labels";
import { ManagementDialog, ManagementInput } from "./ManagementDialog";
import { ManagementPage } from "./ManagementPage";
import { RecordPicker } from "./RecordPicker";
import { SelectField } from "./SelectField";

const DECISION_LABEL: Record<RolloverDecision, () => string> = {
  promote: m.rolloverPromote,
  repeat: m.rolloverRepeat,
  withdraw: m.rolloverWithdraw,
};
const STAGES = ["early_years", "primary", "middle"] as const;

interface Preview {
  source: { id: string; name: string; endsOn: string };
  target: { id: string; name: string; startsOn: string };
  status: string;
  revision: number;
  reconciled: boolean;
  plan: RolloverPlan;
  result: {
    classes: { key: string; classId: string; name: string }[];
    enrolled: number;
    withdrawn: number;
  } | null;
  issue: string | null;
  lookups: {
    classes: { id: string; name: string }[];
    students: { id: string; name: string; reference: string }[];
    subjects: { id: string; name: string; nameAr: string | null }[];
  };
}

export function RolloverWorkspace({
  preview,
  onClose,
}: {
  preview: Preview;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState(preview.plan);
  const [baseline, setBaseline] = useState(() => JSON.stringify(preview.plan));
  const [revision, setRevision] = useState(preview.revision);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string>();
  const query = {
    sourceYearId: preview.source.id,
    targetYearId: preview.target.id,
  };
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["academic-years"] });
  const save = useMutation({
    mutationFn: () =>
      saveRollover({ data: { ...query, expectedRevision: revision, plan } }),
    onSuccess: async (saved) => {
      setRevision(saved.revision);
      setBaseline(JSON.stringify(plan));
      setFailure(undefined);
      toast.success(m.managementSaved());
      await refresh();
    },
    onError: (error) => setFailure(getMessageFromError(error)),
  });
  const apply = useMutation({
    mutationFn: () =>
      applyRollover({ data: { ...query, expectedRevision: revision } }),
    onSuccess: async () => {
      setConfirming(false);
      toast.success(m.rolloverApplied());
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (error) => setFailure(getMessageFromError(error)),
  });
  const className = new Map(
    preview.lookups.classes.map((row) => [row.id, row.name]),
  );
  const studentName = new Map(
    preview.lookups.students.map((row) => [row.id, row]),
  );
  const subjectName = new Map(
    preview.lookups.subjects.map((row) => [
      row.id,
      subjectLabel({ name: row.name, nameAr: row.nameAr ?? undefined }) ??
        row.name,
    ]),
  );
  const included = plan.classes.filter((row) => row.include);
  const updateClass = (key: string, change: Partial<RolloverClass>) =>
    setPlan((current) => ({
      ...current,
      classes: current.classes.map((row) =>
        row.key === key ? { ...row, ...change } : row,
      ),
    }));
  const setDecision = (studentId: string, decision: RolloverDecision) =>
    setPlan((current) => ({
      ...current,
      students: current.students.map((row) => {
        if (row.studentId !== studentId) return row;
        const own = current.classes.find(
          (item) => item.sourceClassId === row.sourceClassId && item.include,
        );
        return {
          ...row,
          decision,
          targetKey:
            decision === "withdraw"
              ? ""
              : decision === "promote"
                ? (own?.key ?? "")
                : row.targetKey,
        };
      }),
    }));
  const setTarget = (studentId: string, targetKey: string) =>
    setPlan((current) => ({
      ...current,
      students: current.students.map((row) =>
        row.studentId === studentId ? { ...row, targetKey } : row,
      ),
    }));

  if (preview.status === "applied" && preview.result) {
    return (
      <section className="space-y-4 rounded-xl border bg-card p-5 sm:p-7">
        <h1 className="text-2xl font-semibold">
          {m.rolloverTitle({ target: preview.target.name })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {m.rolloverAppliedSummary({
            classes: preview.result.classes.length,
            enrolled: preview.result.enrolled,
            withdrawn: preview.result.withdrawn,
            source: preview.source.name,
          })}
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {preview.result.classes.map((row) => (
            <li key={row.classId}>
              <ButtonLink
                to="/classes/$classId"
                params={{ classId: row.classId }}
                variant="outline"
                className="w-full justify-between"
              >
                {row.name}
                <ArrowUpRight className="rtl:-scale-x-100" aria-hidden />
              </ButtonLink>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const dirty = JSON.stringify(plan) !== baseline;
  return (
    <ManagementPage
      title={m.rolloverTitle({ target: preview.target.name })}
      description={m.rolloverHint({
        source: preview.source.name,
        target: preview.target.name,
      })}
      onClose={onClose}
      onSubmit={() => save.mutate()}
      pending={save.isPending || apply.isPending}
      isDirty={() => dirty}
      submitLabel={m.rolloverSavePlan()}
      sectioned
      actions={
        <Button
          type="button"
          variant="outline"
          disabled={
            dirty || revision === 0 || apply.isPending || Boolean(preview.issue)
          }
          onClick={() => {
            setFailure(undefined);
            setConfirming(true);
          }}
        >
          {m.rolloverApply()}
        </Button>
      }
    >
      {preview.issue ? (
        <p role="alert" className="text-sm text-destructive">
          {getMessageFromError(new Error(preview.issue))}
        </p>
      ) : null}
      {preview.reconciled ? (
        <output className="block rounded-lg border p-3 text-sm">
          {m.rolloverReconciled()}
        </output>
      ) : null}
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : null}
      <section
        aria-labelledby="rollover-classes"
        className="space-y-4 rounded-xl border bg-card p-5 sm:p-7"
      >
        <div>
          <h2 id="rollover-classes" className="font-semibold">
            {m.rolloverClasses()}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {m.rolloverClassesHint()}
          </p>
        </div>
        {plan.classes.map((row) => (
          <fieldset
            key={row.key}
            aria-label={m.rolloverFromClass({
              name: className.get(row.sourceClassId) ?? "",
            })}
            className="space-y-4 rounded-lg border bg-background p-4"
          >
            <label className="flex items-center gap-3 text-sm font-medium">
              <Checkbox
                checked={row.include}
                onCheckedChange={(next) =>
                  updateClass(row.key, { include: next })
                }
              />
              {m.rolloverFromClass({
                name: className.get(row.sourceClassId) ?? "",
              })}
            </label>
            {row.include ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <ManagementInput
                    id={`rollover-${row.key}-name`}
                    label={m.managementClassName()}
                    required
                    maxLength={32}
                    value={row.name}
                    onChange={(event) =>
                      updateClass(row.key, { name: event.target.value })
                    }
                  />
                  <ManagementInput
                    id={`rollover-${row.key}-grade`}
                    label={m.studentGrade()}
                    required
                    maxLength={16}
                    value={row.grade}
                    onChange={(event) =>
                      updateClass(row.key, { grade: event.target.value })
                    }
                  />
                  <ManagementInput
                    id={`rollover-${row.key}-room`}
                    label={m.adminRoom()}
                    maxLength={32}
                    value={row.room}
                    onChange={(event) =>
                      updateClass(row.key, { room: event.target.value })
                    }
                  />
                  <SelectField
                    id={`rollover-${row.key}-stage`}
                    label={m.managementStage()}
                    value={row.stage}
                    options={STAGES.map((stage) => ({
                      value: stage,
                      label: STAGE_LABEL[stage](),
                    }))}
                    onChange={(stage) => updateClass(row.key, { stage })}
                  />
                </div>
                <RecordPicker
                  kind="teachers"
                  label={m.adminHomeroom()}
                  value={row.homeroomTeacherId}
                  onChange={(homeroomTeacherId) =>
                    updateClass(row.key, { homeroomTeacherId })
                  }
                />
                {row.subjects.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {row.subjects.map((subject, index) => (
                      <RecordPicker
                        key={subject.subjectId}
                        kind="teachers"
                        label={subjectName.get(subject.subjectId) ?? ""}
                        value={subject.teacherId}
                        onChange={(teacherId) =>
                          updateClass(row.key, {
                            subjects: row.subjects.map((item, position) =>
                              position === index
                                ? { ...item, teacherId }
                                : item,
                            ),
                          })
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </fieldset>
        ))}
      </section>
      <section
        aria-labelledby="rollover-students"
        className="space-y-4 rounded-xl border bg-card p-5 sm:p-7"
      >
        <div>
          <h2 id="rollover-students" className="font-semibold">
            {m.rolloverStudents()}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {m.rolloverStudentsHint({ date: preview.target.startsOn })}
          </p>
        </div>
        {plan.students.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {m.rolloverNoStudents()}
          </p>
        ) : (
          <ul className="divide-y">
            {plan.students.map((row) => {
              const student = studentName.get(row.studentId);
              return (
                <li
                  key={row.studentId}
                  className="grid items-end gap-3 py-3 sm:grid-cols-[1.4fr_1fr_1fr]"
                >
                  <div className="text-sm">
                    <p className="font-medium">{student?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {student?.reference} · {className.get(row.sourceClassId)}
                    </p>
                  </div>
                  <SelectField
                    id={`rollover-${row.studentId}-decision`}
                    label={m.rolloverDecisionFor({ name: student?.name ?? "" })}
                    value={row.decision}
                    options={(["promote", "repeat", "withdraw"] as const).map(
                      (decision) => ({
                        value: decision,
                        label: DECISION_LABEL[decision](),
                      }),
                    )}
                    onChange={(decision) =>
                      setDecision(row.studentId, decision)
                    }
                  />
                  {row.decision === "withdraw" ? (
                    <p className="pb-2 text-sm text-muted-foreground">
                      {m.rolloverWithdrawHint()}
                    </p>
                  ) : (
                    <SelectField
                      id={`rollover-${row.studentId}-target`}
                      label={m.rolloverTargetFor({ name: student?.name ?? "" })}
                      value={row.targetKey || "none"}
                      options={[
                        ...(row.targetKey
                          ? []
                          : [
                              { value: "none", label: m.rolloverChooseClass() },
                            ]),
                        ...included.map((item) => ({
                          value: item.key,
                          label: item.name,
                        })),
                      ]}
                      onChange={(key) => {
                        if (key !== "none") setTarget(row.studentId, key);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {confirming ? (
        <ManagementDialog
          title={m.rolloverConfirmTitle({ target: preview.target.name })}
          description={m.rolloverConfirmHint({
            classes: included.length,
            enrolled: plan.students.filter((row) => row.decision !== "withdraw")
              .length,
            source: preview.source.name,
            date: preview.source.endsOn,
          })}
          pending={apply.isPending}
          submitLabel={m.rolloverApply()}
          onClose={() => setConfirming(false)}
          onSubmit={() => apply.mutate()}
        >
          {failure ? (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          ) : null}
        </ManagementDialog>
      ) : null}
    </ManagementPage>
  );
}
