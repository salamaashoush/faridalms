import type {
  ChecklistItem,
  Currency,
  FeeKind,
  IntakeLetters,
  PriorityRule,
  SaveIntake,
} from "@faridalms/domain/admissions";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { ReactNode } from "react";

import {
  CHECKLIST_KINDS,
  CURRENCIES,
  FEE_KINDS,
  LETTER_KINDS,
  PRIORITY_RULES,
  suggestedCutoff,
} from "@faridalms/domain/admissions";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import {
  FormField,
  NumberField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { FormSection, RecordForm } from "@faridalms/ui/system/record-form";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Value } from "@faridalms/ui/system/value";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { intakeOptionsQuery } from "~/queries/admissions";

import { CheckboxRow } from "~/components/people/fields";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { saveIntake } from "~/server/admissions";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { IntakePartsRead } from "./parts";

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
  titleEn: string;
  titleAr: string;
  startsOn: string;
  /** What modules keep about the intake, by their keys. */
  parts: Record<string, unknown>;
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
  parts: IntakePartsRead,
  intake?: {
    id: string;
    version: number;
    titleEn: string | null;
    titleAr: string | null;
    startsOn: string;
    facts: Record<string, { value: unknown }>;
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
): IntakeDraft {
  const fees = Object.fromEntries(
    FEE_KINDS.map((kind) => [kind, ""]),
  ) as Record<FeeKind, string>;
  for (const fee of intake?.fees ?? []) fees[fee.kind] = String(fee.amount);
  const starts = parts.initial.find((start) => start.startsOn)?.startsOn ?? "";
  const startsOn = intake?.startsOn ?? starts;
  const min = split(intake?.minAgeMonths ?? null);
  const max = split(intake?.maxAgeMonths ?? null);
  return {
    id: intake?.id ?? "",
    version: intake?.version ?? 0,
    titleEn: intake?.titleEn ?? "",
    titleAr: intake?.titleAr ?? "",
    startsOn,
    parts: Object.fromEntries(
      parts.parts.map((part, index) => [
        part.key,
        intake
          ? (intake.facts[part.key]?.value ??
            part.initial(parts.reads[index], {}).value)
          : parts.initial[index]?.value,
      ]),
    ),
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
    ageCutoffOn:
      intake?.ageCutoffOn ??
      (startsOn ? suggestedCutoff(startsOn, options.country) : ""),
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
    titleEn: draft.titleEn,
    titleAr: draft.titleAr,
    startsOn: draft.startsOn,
    parts: draft.parts,
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

const stepName = (item: ChecklistItem) =>
  inLocale(item.labelEn.trim() || null, item.labelAr.trim() || null);

type StepOpener = (item: ChecklistItem) => ReactNode;

type StepRow = ChecklistItem & { id: string };

// Built per render: headers read the request's locale.
function stepColumns(opener: StepOpener): Column<StepRow>[] {
  return [
    { id: "step", header: m.itkItemStepColumn(), primary: true, cell: opener },
    {
      id: "kind",
      header: m.itkItemKind(),
      cell: (item) => CHECKLIST_KIND_LABEL[item.kind](),
    },
    {
      id: "required",
      header: m.itkItemRequired(),
      cell: (item) =>
        item.required ? m.itkItemRequiredYes() : m.itkItemRequiredNo(),
    },
  ];
}

function stepCard(opener: StepOpener) {
  return {
    title: opener,
    fact: (item: ChecklistItem) =>
      `${CHECKLIST_KIND_LABEL[item.kind]()} · ${
        item.required ? m.itkItemRequiredYes() : m.itkItemRequiredNo()
      }`,
  };
}

interface StepSheetProps {
  checklist: ChecklistItem[];
  /** The step being changed; none to add one. */
  item: ChecklistItem | null;
  open: boolean;
  onDone: (checklist: ChecklistItem[]) => void;
  onClose: () => void;
}

/** One step families meet, kept with the intake when it is saved. */
function StepSheet({ checklist, item, open, onDone, onClose }: StepSheetProps) {
  const [draft, setDraft] = useState<ChecklistItem>(
    () =>
      item ?? {
        key: crypto.randomUUID(),
        kind: "document",
        labelEn: "",
        labelAr: "",
        required: true,
      },
  );
  const [tried, setTried] = useState(false);
  const unnamed = !draft.labelEn.trim() && !draft.labelAr.trim();
  const set = (change: Partial<ChecklistItem>) =>
    setDraft((current) => ({ ...current, ...change }));
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={item ? m.itkItemEdit({ item: stepName(item) }) : m.itkItemAdd()}
      submitLabel={item ? m.itkItemSave() : m.itkItemAdd()}
      onSubmit={() => {
        setTried(true);
        if (unnamed) return;
        onDone(
          item
            ? checklist.map((one) => (one.key === draft.key ? draft : one))
            : [...checklist, draft],
        );
        onClose();
      }}
    >
      <TextField
        id="intake-step-en"
        label={m.itkItemLabelEn()}
        width="name"
        dir="ltr"
        maxLength={120}
        autoComplete="off"
        value={draft.labelEn}
        onChange={(event) => set({ labelEn: event.target.value })}
        errors={tried && unnamed ? [m.itkErrChecklistOne()] : undefined}
      />
      <TextField
        id="intake-step-ar"
        label={m.itkItemLabelAr()}
        width="name"
        lang="ar"
        dir="rtl"
        maxLength={120}
        autoComplete="off"
        value={draft.labelAr}
        onChange={(event) => set({ labelAr: event.target.value })}
      />
      <SelectField
        id="intake-step-kind"
        label={m.itkItemKind()}
        value={draft.kind}
        options={CHECKLIST_KINDS.map((kind) => ({
          value: kind,
          label: CHECKLIST_KIND_LABEL[kind](),
        }))}
        onChange={(kind) => set({ kind })}
        width="name"
      />
      <CheckboxRow
        label={m.itkItemRequired()}
        hint={m.itkItemRequiredHint()}
        checked={draft.required}
        onChange={(required) => set({ required })}
      />
    </SheetForm>
  );
}

interface ChecklistTableProps {
  checklist: ChecklistItem[];
  onChange: (checklist: ChecklistItem[]) => void;
  error: string | null;
}

/** The steps families meet, a row each, opened and changed on its own. */
function ChecklistTable({ checklist, onChange, error }: ChecklistTableProps) {
  const [sheet, setSheet] = useState<{
    item: ChecklistItem | null;
    key: number;
    open: boolean;
  } | null>(null);
  const open = (item: ChecklistItem | null) =>
    setSheet((current) => ({ item, key: (current?.key ?? 0) + 1, open: true }));
  const opener: StepOpener = (item) => (
    <RowButton onClick={() => open(item)}>{stepName(item)}</RowButton>
  );
  const add = (variant: "default" | "outline") =>
    checklist.length < 20 ? (
      <Button
        type="button"
        variant={variant}
        className="max-md:h-10"
        onClick={() => open(null)}
      >
        <Plus aria-hidden />
        {m.itkItemAdd()}
      </Button>
    ) : undefined;
  const rowActions = (item: ChecklistItem): RowAction[] => [
    { label: m.recordEdit(), icon: Pencil, onSelect: () => open(item) },
    {
      label: m.itkItemRemoveAction(),
      icon: Trash2,
      destructive: true,
      confirm: {
        title: m.itkItemRemoveTitle({ item: stepName(item) }),
        body: m.itkItemRemoveBody(),
        label: m.itkItemRemoveAction(),
      },
      onSelect: () => onChange(checklist.filter((one) => one.key !== item.key)),
    },
  ];
  return (
    <>
      <DataTable
        caption={m.itkChecklistTable()}
        rows={checklist.map((item) => Object.assign({ id: item.key }, item))}
        columns={stepColumns(opener)}
        rowLabel={stepName}
        rowActions={rowActions}
        actions={add("outline")}
        card={stepCard(opener)}
        empty={{ title: m.itkChecklistNone(), action: add("outline") }}
      />
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-[13px] leading-[18px] text-destructive"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {sheet ? (
        <StepSheet
          key={sheet.key}
          checklist={checklist}
          item={sheet.item}
          open={sheet.open}
          onDone={onChange}
          onClose={() =>
            setSheet((current) => current && { ...current, open: false })
          }
        />
      ) : null}
    </>
  );
}

interface FeeRow {
  id: FeeKind;
  amount: string;
}

type FeeOpener = (row: FeeRow) => ReactNode;

const feeAmount = (amount: string) =>
  amount.trim() === "" ? null : Number(amount);

// Built per render: headers read the request's locale.
function feeColumns(currency: Currency, opener: FeeOpener): Column<FeeRow>[] {
  return [
    { id: "fee", header: m.itkFee(), primary: true, cell: opener },
    {
      id: "amount",
      header: m.itkFeeAmount({ currency }),
      align: "end",
      cell: (row) => {
        const amount = feeAmount(row.amount);
        return amount === null ? (
          <Value absent={m.itkFeeNone()} />
        ) : (
          formatNumber(amount)
        );
      },
    },
  ];
}

function feeCard(currency: Currency, opener: FeeOpener) {
  return {
    title: opener,
    fact: (row: FeeRow) => {
      const amount = feeAmount(row.amount);
      return amount === null
        ? m.itkFeeNone()
        : m.itkFeeCard({ currency, amount: formatNumber(amount) });
    },
  };
}

interface FeeSheetProps {
  kind: FeeKind;
  amount: string;
  currency: Currency;
  open: boolean;
  onDone: (amount: string) => void;
  onClose: () => void;
}

/** What one fee costs, kept with the intake; empty when there is none. */
function FeeSheet({
  kind,
  amount,
  currency,
  open,
  onDone,
  onClose,
}: FeeSheetProps) {
  const [value, setValue] = useState(feeAmount(amount));
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={FEE_KIND_LABEL[kind]()}
      submitLabel={m.itkFeeSave()}
      onSubmit={() => {
        onDone(value === null ? "" : String(value));
        onClose();
      }}
    >
      <NumberField
        id="intake-fee"
        label={m.itkFeeAmount({ currency })}
        hint={m.itkFeeHint()}
        optional
        decimals={2}
        width="reference"
        value={value}
        onChange={setValue}
      />
    </SheetForm>
  );
}

interface FeesTableProps {
  fees: Record<FeeKind, string>;
  currency: Currency;
  onChange: (fees: Record<FeeKind, string>) => void;
}

/** The intake's fees, one row for each kind the school may charge. */
function FeesTable({ fees, currency, onChange }: FeesTableProps) {
  const [sheet, setSheet] = useState<{
    kind: FeeKind;
    key: number;
    open: boolean;
  } | null>(null);
  const open = (kind: FeeKind) =>
    setSheet((current) => ({ kind, key: (current?.key ?? 0) + 1, open: true }));
  const opener: FeeOpener = (row) => (
    <RowButton onClick={() => open(row.id)}>
      {FEE_KIND_LABEL[row.id]()}
    </RowButton>
  );
  const rowActions = (row: FeeRow): RowAction[] => [
    { label: m.recordEdit(), icon: Pencil, onSelect: () => open(row.id) },
    ...(feeAmount(row.amount) === null
      ? []
      : [
          {
            label: m.itkFeeClear(),
            icon: Trash2,
            destructive: true as const,
            confirm: {
              title: m.itkFeeClearTitle({ fee: FEE_KIND_LABEL[row.id]() }),
              body: m.itkFeeClearBody(),
              label: m.itkFeeClear(),
            },
            onSelect: () => onChange({ ...fees, [row.id]: "" }),
          },
        ]),
  ];
  return (
    <>
      <DataTable
        caption={m.itkFeesTable({ currency })}
        rows={FEE_KINDS.map((kind) => ({ id: kind, amount: fees[kind] }))}
        columns={feeColumns(currency, opener)}
        rowLabel={(row) => FEE_KIND_LABEL[row.id]()}
        rowActions={rowActions}
        card={feeCard(currency, opener)}
        empty={{ title: m.itkFeeNone() }}
      />
      {sheet ? (
        <FeeSheet
          key={sheet.key}
          kind={sheet.kind}
          amount={fees[sheet.kind]}
          currency={currency}
          open={sheet.open}
          onDone={(amount) => onChange({ ...fees, [sheet.kind]: amount })}
          onClose={() =>
            setSheet((current) => current && { ...current, open: false })
          }
        />
      ) : null}
    </>
  );
}

export interface IntakeEditorProps {
  options: Options;
  parts: IntakePartsRead;
  initial: IntakeDraft;
  onDone: () => void;
}

/**
 * An intake's settings in one column: its name, the day its learners start
 * and what modules keep about it (its year and grade, say), when families
 * may apply and how many places there are, the form and the checklist they
 * meet, what it costs, decisions and offers, the ages it takes, and the
 * order families are preferred in.
 */
export function IntakeEditor({
  options,
  parts,
  initial,
  onDone,
}: IntakeEditorProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const leaving = useRef(false);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof IntakeDraft>(key: K, value: IntakeDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const creating = draft.id === "";
  const mutation = useMutation({
    mutationFn: () => saveIntake({ data: saveInput(draft) }),
    meta: { inlineError: true },
  });

  const [titled, setTitled] = useState(!creating);
  const errors = {
    title:
      draft.titleEn.trim() || draft.titleAr.trim() ? null : m.itkErrTitle(),
    startsOn: draft.startsOn ? null : m.itkErrDate(),
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

  /** A part's new value, with the start day, ages and name it suggests where they were left as they were. */
  const choosePart = (index: number, value: unknown) => {
    const part = parts.parts[index];
    if (!part) return;
    const read = parts.reads[index];
    const suggested = part.suggest?.(read, value) ?? {};
    setDraft((current) => {
      const next = {
        ...current,
        parts: { ...current.parts, [part.key]: value },
      };
      const untouched =
        current.minYears === "" &&
        current.minMonths === "" &&
        current.maxYears === "" &&
        current.maxMonths === "";
      if (untouched && suggested.ages) {
        const min = split(suggested.ages.minMonths);
        const max = split(suggested.ages.maxMonths);
        Object.assign(next, {
          minYears: min.years,
          minMonths: min.months,
          maxYears: max.years,
          maxMonths: max.months,
        });
      }
      if (creating && suggested.startsOn) {
        next.startsOn = suggested.startsOn;
        next.ageCutoffOn = suggestedCutoff(suggested.startsOn, options.country);
      }
      if (!titled) {
        const titles = parts.parts.flatMap((each, at) => {
          const title = each.titleOf(parts.reads[at], next.parts[each.key]);
          return title ? [title] : [];
        });
        next.titleEn = titles.map((title) => title.en).join(", ");
        next.titleAr = titles.map((title) => title.ar).join("، ");
      }
      return next;
    });
  };

  const movePriority = (rule: PriorityRule, by: -1 | 1) => {
    const list = [...draft.priorities];
    const at = list.indexOf(rule);
    const to = at + by;
    if (at < 0 || to < 0 || to >= list.length) return;
    [list[at], list[to]] = [list[to] as PriorityRule, rule];
    set("priorities", list);
  };

  return (
    <RecordForm
      title={
        creating
          ? m.itkNewTitle()
          : m.itkEditTitle({
              name: inLocale(initial.titleEn || null, initial.titleAr || null),
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
        <TextField
          id="intake-title-ar"
          label={m.itkFieldTitleAr()}
          dir="rtl"
          width="name"
          maxLength={120}
          value={draft.titleAr}
          onChange={(event) => {
            setTitled(true);
            set("titleAr", event.target.value);
          }}
          errors={shown("title")}
        />
        <TextField
          id="intake-title-en"
          label={m.itkFieldTitleEn()}
          dir="ltr"
          width="name"
          maxLength={120}
          value={draft.titleEn}
          onChange={(event) => {
            setTitled(true);
            set("titleEn", event.target.value);
          }}
        />
        {parts.parts.map((part, index) => (
          <part.Field
            key={part.key}
            read={parts.reads[index]}
            value={draft.parts[part.key]}
            startsOn={draft.startsOn}
            fixed={!creating}
            onChange={(value) => choosePart(index, value)}
          />
        ))}
        <TextField
          id="intake-starts"
          label={m.itkFieldStarts()}
          hint={m.itkFieldStartsHint()}
          type="date"
          width="date"
          value={draft.startsOn}
          onChange={(event) => set("startsOn", event.target.value)}
          errors={shown("startsOn")}
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
        <ChecklistTable
          checklist={draft.checklist}
          onChange={(checklist) => set("checklist", checklist)}
          error={tried ? errors.checklist : null}
        />
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
        <FeesTable
          fees={draft.fees}
          currency={draft.currency}
          onChange={(fees) => set("fees", fees)}
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
