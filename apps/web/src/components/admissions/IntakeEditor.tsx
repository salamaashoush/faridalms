import type {
  ChecklistItem,
  Currency,
  FeeKind,
  IntakeLetters,
  PriorityRule,
  SaveIntake,
} from "@faridalms/domain/admissions";
import type { GridColumn, GridIssue } from "@faridalms/ui/system/data-grid";

import {
  CHECKLIST_KINDS,
  CURRENCIES,
  FEE_KINDS,
  LETTER_KINDS,
  PRIORITY_RULES,
} from "@faridalms/domain/admissions";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import {
  CheckCell,
  DataGrid,
  GridAddButton,
  GridRemoveButton,
  NumberCell,
  SelectCell,
  TextCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { FormSection, RecordForm } from "@faridalms/ui/system/record-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { intakeOptionsQuery } from "~/queries/admissions";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { saveIntake } from "~/server/admissions";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import {
  CHECKLIST_KIND_LABEL,
  FEE_KIND_LABEL,
  LETTER_LABEL,
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
  letters: IntakeLetters;
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
    letters: IntakeLetters;
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
    letters: intake?.letters ?? {},
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
    letters: {
      offer: draft.letters.offer ?? {},
      waitlist: draft.letters.waitlist ?? {},
      decline: draft.letters.decline ?? {},
      welcome: draft.letters.welcome ?? {},
    },
  };
}

const wholeIn = (value: string, min: number, max: number) =>
  /^\d+$/.test(value.trim()) && Number(value) >= min && Number(value) <= max;

const itemCell = (
  item: ChecklistItem,
  field: "en" | "ar" | "kind" | "required",
) => `item-${item.key}-${field}`;

/** A step with no name in either language, tied to its English cell. */
function checklistIssues(checklist: readonly ChecklistItem[]): GridIssue[] {
  return checklist.flatMap((item, index) =>
    item.labelEn.trim() || item.labelAr.trim()
      ? []
      : [
          {
            target: itemCell(item, "en"),
            label: m.itkItemStep({ number: formatNumber(index + 1) }),
            message: m.itkErrChecklist(),
          },
        ],
  );
}

interface ChecklistGridOptions {
  checklist: ChecklistItem[];
  change: (key: string, patch: Partial<ChecklistItem>) => void;
  remove: (key: string) => void;
}

// Built per render: headers read the request's locale.
function checklistGrid({ checklist, change, remove }: ChecklistGridOptions) {
  const number = (item: ChecklistItem) =>
    formatNumber(checklist.indexOf(item) + 1);
  const rowHeader = {
    header: m.itkItemLabelEn(),
    cell: (item: ChecklistItem) => (
      <TextCell
        id={itemCell(item, "en")}
        label={m.itkItemLabelEnOf({ number: number(item) })}
        dir="ltr"
        maxLength={120}
        value={item.labelEn}
        onChange={(labelEn) => change(item.key, { labelEn })}
      />
    ),
  };
  const columns: GridColumn<ChecklistItem>[] = [
    {
      id: "ar",
      header: m.itkItemLabelAr(),
      cell: (item) => (
        <TextCell
          id={itemCell(item, "ar")}
          label={m.itkItemLabelArOf({ number: number(item) })}
          lang="ar"
          maxLength={120}
          value={item.labelAr}
          onChange={(labelAr) => change(item.key, { labelAr })}
        />
      ),
    },
    {
      id: "kind",
      header: m.itkItemKind(),
      cell: (item) => (
        <SelectCell
          id={itemCell(item, "kind")}
          label={m.itkItemKindOf({ number: number(item) })}
          value={item.kind}
          options={CHECKLIST_KINDS.map((kind) => ({
            value: kind,
            label: CHECKLIST_KIND_LABEL[kind](),
          }))}
          onChange={(kind) => change(item.key, { kind })}
        />
      ),
    },
    {
      id: "required",
      header: m.itkItemRequired(),
      cell: (item) => (
        <CheckCell
          id={itemCell(item, "required")}
          label={m.itkItemRequiredOf({ number: number(item) })}
          checked={item.required}
          onChange={(required) => change(item.key, { required })}
        />
      ),
    },
  ];
  const rowEnd = (item: ChecklistItem) => (
    <GridRemoveButton
      label={m.itkItemRemove({
        item: item.labelEn || item.labelAr || number(item),
      })}
      onRemove={() => remove(item.key)}
    />
  );
  return { rowHeader, columns, rowEnd };
}

interface FeeGridOptions {
  fees: Record<FeeKind, string>;
  currency: Currency;
  change: (kind: FeeKind, amount: string) => void;
}

// Built per render: headers read the request's locale.
function feeGrid({ fees, currency, change }: FeeGridOptions) {
  const rowHeader = {
    header: m.itkFee(),
    cell: (kind: FeeKind) => FEE_KIND_LABEL[kind](),
  };
  const columns: GridColumn<FeeKind>[] = [
    {
      id: "amount",
      header: m.itkFeeAmount({ currency }),
      numeric: true,
      cell: (kind) => (
        <NumberCell
          id={`fee-${kind}`}
          label={FEE_KIND_LABEL[kind]()}
          decimals={2}
          placeholder="—"
          value={fees[kind].trim() === "" ? null : Number(fees[kind])}
          onChange={(amount) =>
            change(kind, amount === null ? "" : String(amount))
          }
        />
      ),
    },
  ];
  return { rowHeader, columns };
}

export interface IntakeEditorProps {
  options: Options;
  initial: IntakeDraft;
  onDone: () => void;
}

/**
 * An intake's settings in one column: which year and grade, when families
 * may apply and how many places there are, the form and the checklist they
 * meet, what it costs, decisions and offers, the ages it takes, and the
 * order families are preferred in.
 */
export function IntakeEditor({ options, initial, onDone }: IntakeEditorProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const leaving = useRef(false);
  const [tried, setTried] = useState(false);
  const focusLater = useFocusAfterRender();
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

  const addStep = (
    <GridAddButton
      label={m.itkItemAdd()}
      disabled={draft.checklist.length >= 20}
      onAdd={() => {
        const added: ChecklistItem = {
          key: crypto.randomUUID(),
          kind: "document",
          labelEn: "",
          labelAr: "",
          required: true,
        };
        set("checklist", [...draft.checklist, added]);
        focusLater(itemCell(added, "en"));
      }}
    />
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
      isDirty={() =>
        !leaving.current && JSON.stringify(draft) !== JSON.stringify(initial)
      }
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onCancel={onDone}
      onSubmit={async () => {
        setTried(true);
        if (Object.values(errors).some(Boolean)) return;
        await mutation.mutateAsync();
        await queryClient.invalidateQueries({ queryKey: ["admissions"] });
        leaving.current = true;
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
        {draft.checklist.length ? (
          <DataGrid<ChecklistItem>
            caption={m.itkChecklistTable()}
            editing
            {...checklistGrid({
              checklist: draft.checklist,
              change: (key, patch) =>
                set(
                  "checklist",
                  draft.checklist.map((item) =>
                    item.key === key ? { ...item, ...patch } : item,
                  ),
                ),
              remove: (key) =>
                set(
                  "checklist",
                  draft.checklist.filter((item) => item.key !== key),
                ),
            })}
            groups={[{ id: "steps", title: "", rows: draft.checklist }]}
            rowKey={(item) => item.key}
            issues={tried ? checklistIssues(draft.checklist) : []}
            footer={addStep}
          />
        ) : (
          <div>{addStep}</div>
        )}
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
        <DataGrid<FeeKind>
          caption={m.itkFeesTable({ currency: draft.currency })}
          editing
          {...feeGrid({
            fees: draft.fees,
            currency: draft.currency,
            change: (kind, amount) =>
              set("fees", { ...draft.fees, [kind]: amount }),
          })}
          groups={[{ id: "fees", title: "", rows: [...FEE_KINDS] }]}
          rowKey={(kind) => kind}
        />
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
        title={m.itkSectionLetters()}
        description={m.itkSectionLettersHint()}
      >
        {LETTER_KINDS.map((kind) => (
          <div key={kind} className="grid gap-3 sm:grid-cols-2">
            {(["en", "ar"] as const).map((locale) => (
              <SelectField
                key={locale}
                id={`intake-letter-${kind}-${locale}`}
                label={(locale === "en" ? m.itkLetterEn : m.itkLetterAr)({
                  letter: LETTER_LABEL[kind](),
                })}
                value={draft.letters[kind]?.[locale] ?? ""}
                options={[
                  { value: "", label: m.itkLetterSchool() },
                  ...options.letters.map((letter) => ({
                    value: letter.id,
                    label: letter.title,
                  })),
                ]}
                onChange={(id) =>
                  set("letters", {
                    ...draft.letters,
                    [kind]: {
                      ...draft.letters[kind],
                      [locale]: id || undefined,
                    },
                  })
                }
              />
            ))}
          </div>
        ))}
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

interface AgeFieldProps {
  id: string;
  label: string;
  years: string;
  months: string;
  onYears: (value: string) => void;
  onMonths: (value: string) => void;
  error?: string | null;
}

function AgeField({
  id,
  label,
  years,
  months,
  onYears,
  onMonths,
  error,
}: AgeFieldProps) {
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
