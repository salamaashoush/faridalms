import type { Limits } from "@faridalms/domain/subscriptions";

import { DEFAULT_LIMITS } from "@faridalms/domain/plans";
import { Input } from "@faridalms/ui/input";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";

import { formatBytes } from "../format";

type Cap = "poolBytes" | "classBytes" | "moduleBytes" | "personBytes";
type Count = Exclude<keyof Limits, Cap>;
type Unit = "MB" | "GB";

const CAPS: { key: Cap; label: string; hint: string }[] = [
  {
    key: "poolBytes",
    label: "School pool",
    hint: "Everything the school stores.",
  },
  {
    key: "classBytes",
    label: "Each class",
    hint: "A class's files, kept for its assignments.",
  },
  {
    key: "moduleBytes",
    label: "Each module",
    hint: "A module's files, kept for its lessons.",
  },
  {
    key: "personBytes",
    label: "Each person",
    hint: "One person's own work: answers, hand-ins, messages.",
  },
];

const COUNTS: { key: Count; label: string; hint: string }[] = [
  {
    key: "students",
    label: "Students",
    hint: "Soft: past it the administrators are told; enrolling is never refused.",
  },
  {
    key: "staffAccounts",
    label: "Staff accounts",
    hint: "Soft, as students.",
  },
  {
    key: "videoHours",
    label: "Video hours",
    hint: "Streamed video kept. A video past it plays as uploaded.",
  },
  {
    key: "customDomains",
    label: "Custom domains",
    hint: "Hosts of its own the school may add.",
  },
  {
    key: "emailPerMonth",
    label: "Emails a month",
    hint: "Soft: catches a runaway sender.",
  },
  {
    key: "captionMinutes",
    label: "Caption minutes a year",
    hint: "Minutes of caption drafting.",
  },
];

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

/** Limits as an operator edits them: storage with its unit, counts as typed. */
export interface LimitDraft {
  caps: Record<Cap, { value: string; unit: Unit }>;
  counts: Record<Count, string>;
}

function asField(bytes: number | null): { value: string; unit: Unit } {
  if (bytes === null) return { value: "", unit: "GB" };
  return bytes % GIB === 0
    ? { value: String(bytes / GIB), unit: "GB" }
    : { value: String(Math.round(bytes / MIB)), unit: "MB" };
}

function asBytes(field: { value: string; unit: Unit }): number | null {
  const amount = Number(field.value);
  if (field.value.trim() === "" || !Number.isFinite(amount) || amount <= 0)
    return null;
  return Math.round(amount * (field.unit === "GB" ? GIB : MIB));
}

function asCount(value: string): number | null {
  const amount = Number(value);
  return value.trim() === "" || !Number.isInteger(amount) || amount < 0
    ? null
    : amount;
}

export function draftOf(limits: Limits): LimitDraft {
  return {
    caps: Object.fromEntries(
      CAPS.map(({ key }) => [key, asField(limits[key])]),
    ) as LimitDraft["caps"],
    counts: Object.fromEntries(
      COUNTS.map(({ key }) => [key, limits[key]?.toString() ?? ""]),
    ) as LimitDraft["counts"],
  };
}

/**
 * The limits a draft sets: an empty storage limit takes the platform's
 * default, any other empty limit is unlimited.
 */
export function limitsOf(draft: LimitDraft): Limits {
  return {
    poolBytes: asBytes(draft.caps.poolBytes) ?? DEFAULT_LIMITS.poolBytes,
    classBytes: asBytes(draft.caps.classBytes) ?? DEFAULT_LIMITS.classBytes,
    moduleBytes: asBytes(draft.caps.moduleBytes) ?? DEFAULT_LIMITS.moduleBytes,
    personBytes: asBytes(draft.caps.personBytes) ?? DEFAULT_LIMITS.personBytes,
    students: asCount(draft.counts.students),
    staffAccounts: asCount(draft.counts.staffAccounts),
    videoHours: asCount(draft.counts.videoHours),
    customDomains: asCount(draft.counts.customDomains),
    emailPerMonth: asCount(draft.counts.emailPerMonth),
    captionMinutes: asCount(draft.counts.captionMinutes),
  };
}

export interface LimitFieldsProps {
  draft: LimitDraft;
  onChange: (draft: LimitDraft) => void;
}

const UNITS = [
  { value: "MB", label: "MB" },
  { value: "GB", label: "GB" },
] as const;

/** The four storage limits, each a size in MB or GB. */
export function StorageFields({ draft, onChange }: LimitFieldsProps) {
  const set = (key: Cap, field: Partial<{ value: string; unit: Unit }>) =>
    onChange({
      ...draft,
      caps: { ...draft.caps, [key]: { ...draft.caps[key], ...field } },
    });
  return CAPS.map(({ key, label, hint }) => (
    <FormField key={key} label={label} hint={hint} optional>
      {(control) => (
        <span className="flex gap-2">
          <Input
            {...control}
            inputMode="decimal"
            value={draft.caps[key].value}
            placeholder={`Default: ${formatBytes(DEFAULT_LIMITS[key])}`}
            onChange={(event) => set(key, { value: event.target.value })}
            className="max-w-40 max-md:h-10"
          />
          <SelectField
            label={`${label} unit`}
            labelHidden
            value={draft.caps[key].unit}
            options={UNITS}
            onChange={(unit) => set(key, { unit })}
            className="w-24 shrink-0"
          />
        </span>
      )}
    </FormField>
  ));
}

/** The counted limits, each empty for unlimited. */
export function CountFields({ draft, onChange }: LimitFieldsProps) {
  return COUNTS.map(({ key, label, hint }) => (
    <TextField
      key={key}
      label={label}
      hint={hint}
      optional
      inputMode="numeric"
      width="code"
      value={draft.counts[key]}
      placeholder="Unlimited"
      onChange={(event) =>
        onChange({
          ...draft,
          counts: { ...draft.counts, [key]: event.target.value },
        })
      }
    />
  ));
}
