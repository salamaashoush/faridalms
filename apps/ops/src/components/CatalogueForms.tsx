import type {
  AddOnVersionRow,
  PlanVersionRow,
} from "@faridalms/database/business/catalogue";
import type { ModuleId } from "@faridalms/domain/modules";
import type { AddOnKind, LimitKey } from "@faridalms/domain/subscriptions";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { BASIC_ENTITLEMENTS, settableOf } from "@faridalms/domain/plans";
import {
  ADD_ON_KINDS,
  businessToday,
  LIMIT_KEYS,
  pickLimits,
} from "@faridalms/domain/subscriptions";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { FormSection } from "@faridalms/ui/system/record-form";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { attempt, attemptWith } from "../actions";
import {
  formatLimit,
  isStorageKey,
  LIMIT_NAMES,
  MODULE_NAMES,
} from "../format";
import { retire, saveAddOn, savePlan } from "../server/catalogue";
import { CountFields, draftOf, limitsOf, StorageFields } from "./LimitFields";
import { ModuleFields } from "./ModuleFields";
import { PriceFields, priceDraftOf, pricesOf } from "./PriceFields";
import { ReasonSheet } from "./ReasonSheet";
import { WhyField } from "./Why";

export const KIND_NAMES: Record<AddOnKind, string> = {
  module: "Module",
  limit_pack: "Limit pack",
  service: "Service",
};

const GIB = 1024 ** 3;

/** What one of an add-on version gives a school, in a sentence. */
export function addOnGives(version: AddOnVersionRow): string {
  if (version.kind === "module" && version.module)
    return `Gives ${MODULE_NAMES[version.module]}.`;
  if (version.kind === "limit_pack" && version.limitKey)
    return `Adds ${formatLimit(version.limitKey, version.amount)} to ${LIMIT_NAMES[version.limitKey].toLowerCase()}, for each one bought.`;
  return "A service: nothing changes in the schools.";
}

/** The names a version starts from. */
interface Named {
  nameEn: string;
  nameAr: string;
}

/** The fields every version has: its names, when it is sold from, why. */
function useVersionBasics(from: Named | null) {
  const [code, setCode] = useState("");
  const [nameEn, setNameEn] = useState(from?.nameEn ?? "");
  const [nameAr, setNameAr] = useState(from?.nameAr ?? "");
  const [validFrom, setValidFrom] = useState(businessToday());
  const [reason, setReason] = useState("");
  return {
    code,
    setCode,
    nameEn,
    setNameEn,
    nameAr,
    setNameAr,
    validFrom,
    setValidFrom,
    reason,
    setReason,
  };
}

type VersionBasics = ReturnType<typeof useVersionBasics>;

interface BasicsFieldsProps {
  basics: VersionBasics;
  newOne: boolean;
  submitted: boolean;
}

function BasicsFields({ basics, newOne, submitted }: BasicsFieldsProps) {
  const missing = (value: string) => submitted && !value.trim();
  return (
    <>
      {newOne ? (
        <TextField
          label="Code"
          hint="Lowercase letters, digits and underscores; never changes."
          dir="ltr"
          width="reference"
          maxLength={40}
          value={basics.code}
          placeholder="standard"
          errors={missing(basics.code) ? ["Give it a code."] : undefined}
          onChange={(event) => basics.setCode(event.target.value)}
        />
      ) : null}
      <TextField
        label="Name in English"
        maxLength={80}
        value={basics.nameEn}
        errors={missing(basics.nameEn) ? ["Name it in English."] : undefined}
        onChange={(event) => basics.setNameEn(event.target.value)}
      />
      <TextField
        label="Name in Arabic"
        dir="rtl"
        lang="ar"
        maxLength={80}
        value={basics.nameAr}
        errors={missing(basics.nameAr) ? ["Name it in Arabic."] : undefined}
        onChange={(event) => basics.setNameAr(event.target.value)}
      />
      <TextField
        label="Sold from"
        hint="Contracts may hold it from this day."
        type="date"
        width="date"
        value={basics.validFrom}
        onChange={(event) => basics.setValidFrom(event.target.value)}
      />
    </>
  );
}

const basicsMissing = (basics: VersionBasics, newOne: boolean) =>
  (newOne && !basics.code.trim()) ||
  !basics.nameEn.trim() ||
  !basics.nameAr.trim() ||
  !basics.reason.trim();

export interface VersionFormProps<T> {
  /** The latest version, for a new version of it; null for a new one. */
  from: T | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the plan's or add-on's id once it is saved. */
  onSaved: (id: string) => void | Promise<void>;
}

/** A new plan, or a new version of one starting from its latest. */
export function PlanForm({
  from,
  open,
  onOpenChange,
  onSaved,
}: VersionFormProps<PlanVersionRow>) {
  const save = useServerFn(savePlan);
  const basics = useVersionBasics(from);
  const [modules, setModules] = useState<ModuleId[]>(
    from?.modules ?? settableOf(BASIC_ENTITLEMENTS).modules,
  );
  const [limits, setLimits] = useState(() =>
    draftOf(pickLimits(from ?? settableOf(BASIC_ENTITLEMENTS))),
  );
  const [prices, setPrices] = useState(() =>
    (from?.prices ?? []).map(priceDraftOf),
  );
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={from ? `New version of ${from.nameEn}` : "New plan"}
      pending={saving}
      error={answer}
      onSubmit={async () => {
        setSubmitted(true);
        const priced = pricesOf(prices);
        if (!priced) {
          setAnswer("Give each price an amount, or remove it.");
          return;
        }
        if (basicsMissing(basics, !from)) return;
        setSaving(true);
        setAnswer(null);
        const out = await attemptWith(
          () =>
            save({
              data: {
                planId: from?.planId,
                code: from?.code ?? basics.code,
                nameEn: basics.nameEn,
                nameAr: basics.nameAr,
                modules,
                limits: limitsOf(limits),
                prices: priced,
                validFrom: basics.validFrom,
                reason: basics.reason,
              },
            }),
          "The plan could not be saved.",
        );
        setSaving(false);
        if (!out.ok) {
          setAnswer(out.message);
          return;
        }
        toast.success(from ? "New version saved." : "Plan saved.");
        onOpenChange(false);
        await onSaved(out.value.id);
      }}
    >
      <FormSection
        title={from ? `Version ${from.version + 1}` : "Plan"}
        description={
          from
            ? `Starts from version ${from.version}; contracts holding it keep it.`
            : undefined
        }
      >
        <BasicsFields basics={basics} newOne={!from} submitted={submitted} />
      </FormSection>
      <FormSection title="Prices">
        <PriceFields drafts={prices} onChange={setPrices} />
      </FormSection>
      <FormSection title="Modules">
        <ModuleFields modules={modules} onChange={setModules} labelHidden />
      </FormSection>
      <FormSection
        title="Storage"
        description="Empty takes the platform's default."
      >
        <StorageFields draft={limits} onChange={setLimits} />
      </FormSection>
      <FormSection title="Allowances" description="Empty is unlimited.">
        <CountFields draft={limits} onChange={setLimits} />
      </FormSection>
      <WhyField
        value={basics.reason}
        onChange={basics.setReason}
        submitted={submitted}
        placeholder="For example: the price for the 2027 school year"
      />
    </SheetForm>
  );
}

const KIND_OPTIONS = ADD_ON_KINDS.map((choice) => ({
  value: choice,
  label: KIND_NAMES[choice],
}));

const MODULE_OPTIONS = MODULE_IDS.map((choice) => ({
  value: choice,
  label: MODULE_NAMES[choice],
}));

const LIMIT_OPTIONS = LIMIT_KEYS.map((choice) => ({
  value: choice,
  label: LIMIT_NAMES[choice],
}));

/** A new add-on, or a new version of one of the same kind. */
export function AddOnForm({
  from,
  open,
  onOpenChange,
  onSaved,
}: VersionFormProps<AddOnVersionRow>) {
  const save = useServerFn(saveAddOn);
  const basics = useVersionBasics(from);
  const [kind, setKind] = useState<AddOnKind>(from?.kind ?? "module");
  const [module, setModule] = useState<ModuleId>(from?.module ?? "coding");
  const [limitKey, setLimitKey] = useState<LimitKey>(
    from?.limitKey ?? "poolBytes",
  );
  const [amount, setAmount] = useState(() =>
    from?.amount && from.limitKey
      ? String(isStorageKey(from.limitKey) ? from.amount / GIB : from.amount)
      : "",
  );
  const [prices, setPrices] = useState(() =>
    (from?.prices ?? []).map(priceDraftOf),
  );
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const storage = isStorageKey(limitKey);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={from ? `New version of ${from.nameEn}` : "New add-on"}
      pending={saving}
      error={answer}
      onSubmit={async () => {
        setSubmitted(true);
        const priced = pricesOf(prices);
        if (!priced) {
          setAnswer("Give each price an amount, or remove it.");
          return;
        }
        const typed = Number(amount);
        const packed =
          kind === "limit_pack" && Number.isFinite(typed) && typed > 0
            ? Math.round(storage ? typed * GIB : typed)
            : null;
        if (kind === "limit_pack" && packed === null) {
          setAnswer("Say how much one pack adds.");
          return;
        }
        if (basicsMissing(basics, !from)) return;
        setSaving(true);
        setAnswer(null);
        const out = await attemptWith(
          () =>
            save({
              data: {
                addOnId: from?.addOnId,
                code: from?.code ?? basics.code,
                nameEn: basics.nameEn,
                nameAr: basics.nameAr,
                kind,
                module: kind === "module" ? module : null,
                limitKey: kind === "limit_pack" ? limitKey : null,
                amount: packed,
                prices: priced,
                validFrom: basics.validFrom,
                reason: basics.reason,
              },
            }),
          "The add-on could not be saved.",
        );
        setSaving(false);
        if (!out.ok) {
          setAnswer(out.message);
          return;
        }
        toast.success(from ? "New version saved." : "Add-on saved.");
        onOpenChange(false);
        await onSaved(out.value.id);
      }}
    >
      <FormSection
        title={from ? `Version ${from.version + 1}` : "Add-on"}
        description={
          from
            ? `Starts from version ${from.version}; contracts holding it keep it.`
            : undefined
        }
      >
        <BasicsFields basics={basics} newOne={!from} submitted={submitted} />
      </FormSection>
      <FormSection title="What it gives">
        <SelectField
          label="Kind"
          hint={from ? "A new version keeps its kind." : undefined}
          value={kind}
          disabled={Boolean(from)}
          options={KIND_OPTIONS}
          onChange={setKind}
        />
        {kind === "module" ? (
          <SelectField
            label="Module"
            value={module}
            options={MODULE_OPTIONS}
            onChange={setModule}
          />
        ) : null}
        {kind === "limit_pack" ? (
          <>
            <SelectField
              label="Limit"
              value={limitKey}
              options={LIMIT_OPTIONS}
              onChange={setLimitKey}
            />
            <TextField
              label={`One pack adds${storage ? " (GB)" : ""}`}
              inputMode={storage ? "decimal" : "numeric"}
              width="code"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </>
        ) : null}
      </FormSection>
      <FormSection title="Prices">
        <PriceFields drafts={prices} onChange={setPrices} />
      </FormSection>
      <WhyField
        value={basics.reason}
        onChange={basics.setReason}
        submitted={submitted}
        placeholder="For example: the price for the 2027 school year"
      />
    </SheetForm>
  );
}

export interface RetireSheetProps {
  kind: "plan" | "add_on";
  /** The version's id. */
  id: string;
  version: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Stops a version being sold, with why; contracts that hold it keep it. */
export function RetireSheet({
  kind,
  id,
  version,
  open,
  onOpenChange,
}: RetireSheetProps) {
  const router = useRouter();
  const send = useServerFn(retire);
  return (
    <ReasonSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Retire version ${version}`}
      submitLabel="Retire this version"
      destructive
      placeholder={`For example: replaced by version ${version + 1}`}
      onSubmit={async (reason) => {
        const failed = await attempt(
          () => send({ data: { kind, id, reason } }),
          "The version could not be retired.",
        );
        if (failed) return failed;
        toast.success("Retired. Contracts that hold it keep it.");
        await router.invalidate();
        return null;
      }}
    />
  );
}
