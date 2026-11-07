import type { SchoolNotice } from "@faridalms/domain/plans";
import type {
  BillingSchedule,
  SubscriptionTerms,
} from "@faridalms/domain/subscriptions";

import { SCHOOL_NOTICES } from "@faridalms/domain/plans";
import { addDays } from "@faridalms/domain/school";
import { BILLING_SCHEDULES, TRIAL_DAYS } from "@faridalms/domain/subscriptions";
import {
  ChoiceField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";

import { NOTICE_NAMES } from "../format";

export const SCHEDULE_NAMES: Record<BillingSchedule, string> = {
  annual: "Annually in advance",
  two: "In two instalments",
  three: "In three instalments",
};

/** A subscription's terms as an operator edits them. */
export interface TermsDraft {
  state: "trial" | "active";
  trialEndsOn: string;
  termStartsOn: string;
  termEndsOn: string;
  renewal: "auto" | "manual";
  schedule: BillingSchedule;
  students: string;
  censusOn: string;
  notice: SchoolNotice | "";
}

/** Terms to edit; a trial without an end is given the usual length from today. */
export function termsDraftOf(
  terms: {
    state: "trial" | "active" | "ended";
    trialEndsOn: string | null;
    termStartsOn: string | null;
    termEndsOn: string | null;
    renewal: "auto" | "manual";
    schedule: BillingSchedule;
    contractedStudents: number | null;
    censusOn: string | null;
    notice: SchoolNotice | null;
  },
  today: string,
): TermsDraft {
  return {
    state: terms.state === "trial" ? "trial" : "active",
    trialEndsOn: terms.trialEndsOn ?? addDays(today, TRIAL_DAYS),
    termStartsOn: terms.termStartsOn ?? "",
    termEndsOn: terms.termEndsOn ?? "",
    renewal: terms.renewal,
    schedule: terms.schedule,
    students: terms.contractedStudents?.toString() ?? "",
    censusOn: terms.censusOn ?? "",
    notice: terms.notice ?? "",
  };
}

/** The terms a draft sets, or why they cannot be read. */
export function termsOf(
  draft: TermsDraft,
): { ok: true; terms: SubscriptionTerms } | { ok: false; message: string } {
  const contracted =
    draft.students.trim() === "" ? null : Number(draft.students);
  if (contracted !== null && (!Number.isInteger(contracted) || contracted < 1))
    return {
      ok: false,
      message: "Contracted students is a whole number, or empty.",
    };
  return {
    ok: true,
    terms: {
      state: draft.state,
      trialEndsOn: draft.state === "trial" ? draft.trialEndsOn || null : null,
      termStartsOn: draft.termStartsOn || null,
      termEndsOn: draft.termEndsOn || null,
      renewal: draft.renewal,
      schedule: draft.schedule,
      contractedStudents: contracted,
      censusOn: draft.censusOn || null,
      notice: draft.notice || null,
    },
  };
}

const HOLDS_OPTIONS = [
  { value: "trial", label: "A trial" },
  { value: "active", label: "A contract" },
] as const;

const RENEWAL_OPTIONS = [
  { value: "auto", label: "Renews on its own" },
  { value: "manual", label: "Renewed by hand" },
] as const;

const SCHEDULE_OPTIONS = BILLING_SCHEDULES.map((choice) => ({
  value: choice,
  label: SCHEDULE_NAMES[choice],
}));

const NOTICE_OPTIONS = [
  { value: "", label: "None" },
  ...SCHOOL_NOTICES.map((code) => ({ value: code, label: NOTICE_NAMES[code] })),
] as const;

export interface TermsFieldsProps {
  draft: TermsDraft;
  onChange: (draft: TermsDraft) => void;
}

/** A trial's last day, or a contract's term, renewal, billing and students. */
export function TermsFields({ draft, onChange }: TermsFieldsProps) {
  const set = (change: Partial<TermsDraft>) =>
    onChange({ ...draft, ...change });
  return (
    <>
      <ChoiceField
        label="Holds"
        value={draft.state}
        options={HOLDS_OPTIONS}
        onChange={(state) => set({ state })}
      />
      <div className="grid items-start gap-6 @md:grid-cols-2">
        {draft.state === "trial" ? (
          <TextField
            label="Trial's last day"
            type="date"
            hint="Unless it has a contract by then, the tenant becomes read only the day after."
            value={draft.trialEndsOn}
            onChange={(event) => set({ trialEndsOn: event.target.value })}
          />
        ) : null}
        <TextField
          label="Term starts"
          optional={draft.state === "trial"}
          type="date"
          value={draft.termStartsOn}
          onChange={(event) => set({ termStartsOn: event.target.value })}
        />
        <TextField
          label="Term ends"
          optional={draft.termStartsOn === ""}
          type="date"
          value={draft.termEndsOn}
          onChange={(event) => set({ termEndsOn: event.target.value })}
        />
        <SelectField
          label="Renewal"
          value={draft.renewal}
          options={RENEWAL_OPTIONS}
          onChange={(renewal) => set({ renewal })}
        />
        <SelectField
          label="Billing"
          value={draft.schedule}
          options={SCHEDULE_OPTIONS}
          onChange={(schedule) => set({ schedule })}
        />
        <TextField
          label="Contracted students"
          optional
          inputMode="numeric"
          value={draft.students}
          onChange={(event) => set({ students: event.target.value })}
        />
        <TextField
          label="Census day"
          optional
          type="date"
          hint="When students are counted against the contract."
          value={draft.censusOn}
          onChange={(event) => set({ censusOn: event.target.value })}
        />
        <SelectField
          label="Notice"
          hint="What the schools' administrators are shown."
          value={draft.notice}
          options={NOTICE_OPTIONS}
          onChange={(notice) => set({ notice })}
        />
      </div>
    </>
  );
}
