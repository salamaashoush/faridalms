import type {
  ChecklistItem,
  Currency,
  FeeKind,
  PriorityRule,
  SaveIntake,
} from "@faridalms/domain/admissions";

import {
  CHECKLIST_KINDS,
  CURRENCIES,
  FEE_KINDS,
  PRIORITY_RULES,
} from "@faridalms/domain/admissions";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { intakeOptionsQuery } from "~/queries/admissions";

import { FormField, SelectField, TextField } from "~/components/system/field";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { saveIntake } from "~/server/admissions";
import { getMessageFromError } from "~/utils/error";

import {
  CHECKLIST_KIND_LABEL,
  FEE_KIND_LABEL,
  named,
  PRIORITY_LABEL,
} from "./application-labels";

type Options = Awaited<
  ReturnType<NonNullable<(typeof intakeOptionsQuery)["queryFn"]>>
>;

export interface IntakeDraft {
  id: string;
  version: number;
  schoolYearId: string;
  gradeId: string;
  opensOn: string;
  closesOn: string;
  capacity: string;
  formId: string;
  checklist: ChecklistItem[];
  currency: Currency;
  fees: Record<FeeKind, string>;
  decisionsOn: string;
  offerDays: string;
  ageCutoffOn: string;
  minYears: string;
  minMonths: string;
  maxYears: string;
  maxMonths: string;
  priorities: PriorityRule[];
}

const split = (months: number | null) =>
  months === null
    ? { years: "", months: "" }
    : { years: String(Math.floor(months / 12)), months: String(months % 12) };

const joined = (years: string, months: string) =>
  years.trim() === "" && months.trim() === ""
    ? null
    : Number(years || 0) * 12 + Number(months || 0);

/** A new intake's starting values, or an existing one's as saved. */
export function intakeDraft(
  options: Options,
  intake?: {
    id: string;
    version: number;
    schoolYearId: string;
    gradeId: string;
    opensOn: string;
    closesOn: string;
    capacity: number;
    formId: string;
    checklist: ChecklistItem[];
    currency: Currency;
    fees: { kind: FeeKind; amount: number }[];
    decisionsOn: string | null;
    offerDays: number;
    ageCutoffOn: string;
    minAgeMonths: number | null;
    maxAgeMonths: number | null;
    priorities: PriorityRule[];
  },
  year?: string,
): IntakeDraft {
  const fees = Object.fromEntries(
    FEE_KINDS.map((kind) => [kind, ""]),
  ) as Record<FeeKind, string>;
  for (const fee of intake?.fees ?? []) fees[fee.kind] = String(fee.amount);
  const chosenYear =
    options.years.find((row) => row.id === (intake?.schoolYearId ?? year)) ??
    options.years.find((row) => row.lifecycle === "upcoming") ??
    options.years[0];
  const min = split(intake?.minAgeMonths ?? null);
  const max = split(intake?.maxAgeMonths ?? null);
  return {
    id: intake?.id ?? "",
    version: intake?.version ?? 0,
    schoolYearId: chosenYear?.id ?? "",
    gradeId: intake?.gradeId ?? "",
    opensOn: intake?.opensOn ?? "",
    closesOn: intake?.closesOn ?? "",
    capacity: intake ? String(intake.capacity) : "",
    formId:
      intake?.formId ?? options.forms.find((form) => form.published)?.id ?? "",
    checklist: intake?.checklist ?? [],
    currency: intake?.currency ?? "EGP",
    fees,
    decisionsOn: intake?.decisionsOn ?? "",
    offerDays: String(intake?.offerDays ?? 14),
    ageCutoffOn: intake?.ageCutoffOn ?? chosenYear?.cutoffOn ?? "",
    minYears: min.years,
    minMonths: min.months,
    maxYears: max.years,
    maxMonths: max.months,
    priorities: intake?.priorities ?? [...PRIORITY_RULES],
  };
}

function saveInput(draft: IntakeDraft): SaveIntake {
  return {
    id: draft.id,
    expectedVersion: draft.version,
    schoolYearId: draft.schoolYearId,
    gradeId: draft.gradeId,
    opensOn: draft.opensOn,
    closesOn: draft.closesOn,
    capacity: Number(draft.capacity),
    formId: draft.formId,
    checklist: draft.checklist,
    currency: draft.currency,
    fees: FEE_KINDS.flatMap((kind) =>
      draft.fees[kind].trim() === ""
        ? []
        : [{ kind, amount: Number(draft.fees[kind]) }],
    ),
    decisionsOn: draft.decisionsOn,
    offerDays: Number(draft.offerDays),
    ageCutoffOn: draft.ageCutoffOn,
    minAgeMonths: joined(draft.minYears, draft.minMonths),
    maxAgeMonths: joined(draft.maxYears, draft.maxMonths),
    priorities: draft.priorities,
  };
}

const wholeIn = (value: string, min: number, max: number) =>
  /^\d+$/.test(value.trim()) && Number(value) >= min && Number(value) <= max;

/**
 * An intake's settings in one column: which year and grade, when families
 * may apply and how many places there are, the form and the checklist they
 * meet, what it costs, decisions and offers, the ages it takes, and the
 * order families are preferred in.
 */
export function IntakeEditor({
  options,
  initial,
  onDone,
}: {
  options: Options;
  initial: IntakeDraft;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof IntakeDraft>(key: K, value: IntakeDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const creating = draft.id === "";
  const mutation = useMutation({
    mutationFn: () => saveIntake({ data: saveInput(draft) }),
    meta: { inlineError: true },
  });

  const errors = {
    gradeId: draft.gradeId ? null : m.itkErrGrade(),
    opensOn: draft.opensOn ? null : m.itkErrDate(),
    closesOn: !draft.closesOn
      ? m.itkErrDate()
      : draft.opensOn && draft.closesOn < draft.opensOn
        ? m.itkErrDates()
        : null,
    capacity: wholeIn(draft.capacity, 1, 5000) ? null : m.itkErrCapacity(),
    formId: draft.formId ? null : m.itkErrForm(),
    offerDays: wholeIn(draft.offerDays, 1, 120) ? null : m.itkErrOfferDays(),
    ageCutoffOn: draft.ageCutoffOn ? null : m.itkErrDate(),
    ages: (() => {
      const min = joined(draft.minYears, draft.minMonths);
      const max = joined(draft.maxYears, draft.maxMonths);
      return min !== null && max !== null && min > max ? m.itkErrAges() : null;
    })(),
    checklist: draft.checklist.some(
      (item) => !item.labelEn.trim() && !item.labelAr.trim(),
    )
      ? m.itkErrChecklist()
      : null,
  };
  const shown = (key: keyof typeof errors) =>
    tried && errors[key] ? [errors[key]] : undefined;

  const chooseGrade = (gradeId: string) => {
    const grade = options.grades.find((row) => row.id === gradeId);
    setDraft((current) => {
      const min = split(grade?.minMonths ?? null);
      const max = split(grade?.maxMonths ?? null);
      const untouched =
        current.minYears === "" &&
        current.minMonths === "" &&
        current.maxYears === "" &&
        current.maxMonths === "";
      return {
        ...current,
        gradeId,
        ...(untouched
          ? {
              minYears: min.years,
              minMonths: min.months,
              maxYears: max.years,
              maxMonths: max.months,
            }
          : {}),
      };
    });
  };

  const chooseYear = (yearId: string) => {
    const year = options.years.find((row) => row.id === yearId);
    setDraft((current) => ({
      ...current,
      schoolYearId: yearId,
      ageCutoffOn: year?.cutoffOn ?? current.ageCutoffOn,
    }));
  };

  const setItem = (index: number, patch: Partial<ChecklistItem>) =>
    set(
      "checklist",
      draft.checklist.map((item, at) =>
        at === index ? { ...item, ...patch } : item,
      ),
    );

  const movePriority = (rule: PriorityRule, by: -1 | 1) => {
    const list = [...draft.priorities];
    const at = list.indexOf(rule);
    const to = at + by;
    if (at < 0 || to < 0 || to >= list.length) return;
    [list[at], list[to]] = [list[to] as PriorityRule, rule];
    set("priorities", list);
  };

  const grade = options.grades.find((row) => row.id === draft.gradeId);
  const year = options.years.find((row) => row.id === draft.schoolYearId);

  return (
    <RecordForm
      title={
        creating
          ? m.itkNewTitle()
          : m.itkEditTitle({
              grade: inLocale(grade?.labelEn ?? null, grade?.labelAr ?? null),
              year: inLocale(year?.titleEn ?? null, year?.titleAr ?? null),
            })
      }
      description={m.itkEditorHint()}
      isDirty={() => JSON.stringify(draft) !== JSON.stringify(initial)}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onCancel={onDone}
      onSubmit={async () => {
        setTried(true);
        if (Object.values(errors).some(Boolean)) return;
        await mutation.mutateAsync();
        await queryClient.invalidateQueries({ queryKey: ["admissions"] });
        toast.success(m.itkSaved());
        onDone();
      }}
    >
      <FormSection
        title={m.itkSectionWhich()}
        description={m.itkSectionWhichHint()}
      >
        <SelectField
          id="intake-year"
          label={m.itkFieldYear()}
          value={draft.schoolYearId}
          disabled={!creating}
          options={options.years.map((row) => ({
            value: row.id,
            label: inLocale(row.titleEn, row.titleAr),
          }))}
          onChange={chooseYear}
          width="name"
        />
        <SelectField
          id="intake-grade"
          label={m.itkFieldGrade()}
          value={draft.gradeId}
          disabled={!creating}
          options={[
            { value: "", label: m.itkChooseGrade() },
            ...options.grades.map((row) => ({
              value: row.id,
              label: inLocale(row.labelEn, row.labelAr),
            })),
          ]}
          onChange={chooseGrade}
          errors={shown("gradeId")}
          width="name"
        />
      </FormSection>

      <FormSection title={m.itkSectionWindow()}>
        <div className="flex flex-wrap gap-4">
          <TextField
            id="intake-opens"
            label={m.itkFieldOpens()}
            type="date"
            width="date"
            value={draft.opensOn}
            onChange={(event) => set("opensOn", event.target.value)}
            errors={shown("opensOn")}
          />
          <TextField
            id="intake-closes"
            label={m.itkFieldCloses()}
            type="date"
            width="date"
            min={draft.opensOn || undefined}
            value={draft.closesOn}
            onChange={(event) => set("closesOn", event.target.value)}
            errors={shown("closesOn")}
          />
        </div>
        <TextField
          id="intake-capacity"
          label={m.itkFieldCapacity()}
          hint={m.itkFieldCapacityHint()}
          type="number"
          inputMode="numeric"
          min={1}
          max={5000}
          width="score"
          value={draft.capacity}
          onChange={(event) => set("capacity", event.target.value)}
          errors={shown("capacity")}
        />
        <SelectField
          id="intake-form"
          label={m.itkFieldForm()}
          hint={m.itkFieldFormHint()}
          value={draft.formId}
          options={[
            { value: "", label: m.itkChooseForm() },
            ...options.forms
              .filter((form) => form.published)
              .map((form) => ({
                value: form.id,
                label: named(form.nameEn, form.nameAr),
              })),
          ]}
          onChange={(formId) => set("formId", formId)}
          errors={shown("formId")}
          width="name"
        />
      </FormSection>

      <FormSection
        title={m.itkSectionAges()}
        description={m.itkSectionAgesHint()}
      >
        <TextField
          id="intake-cutoff"
          label={m.itkFieldCutoff()}
          hint={m.itkFieldCutoffHint()}
          type="date"
          width="date"
          value={draft.ageCutoffOn}
          onChange={(event) => set("ageCutoffOn", event.target.value)}
          errors={shown("ageCutoffOn")}
        />
        <AgeField
          id="intake-min"
          label={m.itkFieldMinAge()}
          years={draft.minYears}
          months={draft.minMonths}
          onYears={(value) => set("minYears", value)}
          onMonths={(value) => set("minMonths", value)}
        />
        <AgeField
          id="intake-max"
          label={m.itkFieldMaxAge()}
          years={draft.maxYears}
          months={draft.maxMonths}
          onYears={(value) => set("maxYears", value)}
          onMonths={(value) => set("maxMonths", value)}
          error={tried ? errors.ages : null}
        />
      </FormSection>

      <FormSection
        title={m.itkSectionChecklist()}
        description={m.itkSectionChecklistHint()}
      >
        <ol className="grid gap-4" aria-label={m.itkSectionChecklist()}>
          {draft.checklist.map((item, index) => (
            <li key={item.key} className="grid gap-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-end gap-3">
                <SelectField
                  id={`item-${item.key}-kind`}
                  label={m.itkItemKind()}
                  value={item.kind}
                  options={CHECKLIST_KINDS.map((kind) => ({
                    value: kind,
                    label: CHECKLIST_KIND_LABEL[kind](),
                  }))}
                  onChange={(kind) => setItem(index, { kind })}
                  className="w-44"
                />
                <label className="flex min-h-9 items-center gap-2 text-sm">
                  <Checkbox
                    checked={item.required}
                    onCheckedChange={(required) => setItem(index, { required })}
                  />
                  {m.itkItemRequired()}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ms-auto"
                  aria-label={m.itkItemRemove({
                    item: item.labelEn || item.labelAr || String(index + 1),
                  })}
                  onClick={() =>
                    set(
                      "checklist",
                      draft.checklist.filter((_, at) => at !== index),
                    )
                  }
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  id={`item-${item.key}-en`}
                  label={m.itkItemLabelEn()}
                  dir="ltr"
                  value={item.labelEn}
                  maxLength={120}
                  onChange={(event) =>
                    setItem(index, { labelEn: event.target.value })
                  }
                />
                <TextField
                  id={`item-${item.key}-ar`}
                  label={m.itkItemLabelAr()}
                  dir="rtl"
                  value={item.labelAr}
                  maxLength={120}
                  onChange={(event) =>
                    setItem(index, { labelAr: event.target.value })
                  }
                />
              </div>
            </li>
          ))}
        </ol>
        {tried && errors.checklist ? (
          <p className="text-[13px] text-destructive">{errors.checklist}</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={draft.checklist.length >= 20}
          onClick={() =>
            set("checklist", [
              ...draft.checklist,
              {
                key: crypto.randomUUID(),
                kind: "document",
                labelEn: "",
                labelAr: "",
                required: true,
              },
            ])
          }
        >
          <Plus aria-hidden className="size-4" />
          {m.itkItemAdd()}
        </Button>
      </FormSection>

      <FormSection
        title={m.itkSectionFees()}
        description={m.itkSectionFeesHint()}
      >
        <SelectField
          id="intake-currency"
          label={m.itkFieldCurrency()}
          value={draft.currency}
          options={CURRENCIES.map((currency) => ({
            value: currency,
            label: currency,
          }))}
          onChange={(currency) => set("currency", currency)}
          width="code"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {FEE_KINDS.map((kind) => (
            <TextField
              key={kind}
              id={`fee-${kind}`}
              label={FEE_KIND_LABEL[kind]()}
              optional
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              dir="ltr"
              value={draft.fees[kind]}
              onChange={(event) =>
                set("fees", { ...draft.fees, [kind]: event.target.value })
              }
            />
          ))}
        </div>
      </FormSection>

      <FormSection title={m.itkSectionDecisions()}>
        <TextField
          id="intake-decisions"
          label={m.itkFieldDecisions()}
          hint={m.itkFieldDecisionsHint()}
          optional
          type="date"
          width="date"
          value={draft.decisionsOn}
          onChange={(event) => set("decisionsOn", event.target.value)}
        />
        <TextField
          id="intake-offer-days"
          label={m.itkFieldOfferDays()}
          hint={m.itkFieldOfferDaysHint()}
          type="number"
          inputMode="numeric"
          min={1}
          max={120}
          width="score"
          value={draft.offerDays}
          onChange={(event) => set("offerDays", event.target.value)}
          errors={shown("offerDays")}
        />
      </FormSection>

      <FormSection
        title={m.itkSectionPriorities()}
        description={m.itkSectionPrioritiesHint()}
      >
        <ol className="grid gap-2" aria-label={m.itkSectionPriorities()}>
          {[
            ...draft.priorities,
            ...PRIORITY_RULES.filter(
              (rule) => !draft.priorities.includes(rule),
            ),
          ].map((rule) => {
            const on = draft.priorities.includes(rule);
            const at = draft.priorities.indexOf(rule);
            return (
              <li
                key={rule}
                className="flex min-h-11 items-center gap-3 rounded-md border px-3"
              >
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <Checkbox
                    checked={on}
                    onCheckedChange={(next) =>
                      set(
                        "priorities",
                        next
                          ? [...draft.priorities, rule]
                          : draft.priorities.filter((each) => each !== rule),
                      )
                    }
                  />
                  {on ? `${String(at + 1)}. ` : ""}
                  {PRIORITY_LABEL[rule]()}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!on || at === 0}
                  aria-label={m.itkPriorityUp({ rule: PRIORITY_LABEL[rule]() })}
                  onClick={() => movePriority(rule, -1)}
                >
                  <ArrowUp aria-hidden className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!on || at === draft.priorities.length - 1}
                  aria-label={m.itkPriorityDown({
                    rule: PRIORITY_LABEL[rule](),
                  })}
                  onClick={() => movePriority(rule, 1)}
                >
                  <ArrowDown aria-hidden className="size-4" />
                </Button>
              </li>
            );
          })}
        </ol>
      </FormSection>
    </RecordForm>
  );
}

function AgeField({
  id,
  label,
  years,
  months,
  onYears,
  onMonths,
  error,
}: {
  id: string;
  label: string;
  years: string;
  months: string;
  onYears: (value: string) => void;
  onMonths: (value: string) => void;
  error?: string | null;
}) {
  return (
    <FormField
      id={id}
      label={label}
      optional
      errors={error ? [error] : undefined}
    >
      {(control) => (
        <div className="flex items-center gap-3">
          <Input
            {...control}
            type="number"
            inputMode="numeric"
            min={0}
            max={25}
            value={years}
            aria-label={m.itkAgeYears({ field: label })}
            onChange={(event) => onYears(event.target.value)}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">{m.itkYears()}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={11}
            value={months}
            aria-label={m.itkAgeMonths({ field: label })}
            onChange={(event) => onMonths(event.target.value)}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">{m.itkMonths()}</span>
        </div>
      )}
    </FormField>
  );
}
