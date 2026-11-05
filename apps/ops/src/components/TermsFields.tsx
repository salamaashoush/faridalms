import type { SchoolNotice } from "@faridalms/domain/plans";
import type {
  BillingSchedule,
  SubscriptionTerms,
} from "@faridalms/domain/subscriptions";

import { SCHOOL_NOTICES } from "@faridalms/domain/plans";
import { addDays } from "@faridalms/domain/school";
import { BILLING_SCHEDULES, TRIAL_DAYS } from "@faridalms/domain/subscriptions";
import { Input } from "@faridalms/ui/input";

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

const FIELD = "grid gap-1.5 text-sm";
const SELECT = "h-9 rounded-md border bg-background px-2 text-sm";

/** A trial's last day, or a contract's term, renewal, billing and students. */
export function TermsFields({
  draft,
  onChange,
}: {
  draft: TermsDraft;
  onChange: (draft: TermsDraft) => void;
}) {
  const set = (change: Partial<TermsDraft>) =>
    onChange({ ...draft, ...change });
  return (
    <>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="sr-only">Holds</legend>
        {(["trial", "active"] as const).map((choice) => (
          <span key={choice} className="flex items-center gap-2">
            <input
              id={`terms-${choice}`}
              type="radio"
              name="terms-state"
              checked={draft.state === choice}
              onChange={() => set({ state: choice })}
            />
            <label htmlFor={`terms-${choice}`}>
              {choice === "trial" ? "A trial" : "A contract"}
            </label>
          </span>
        ))}
      </fieldset>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        {draft.state === "trial" ? (
          <div className={FIELD}>
            <label htmlFor="terms-trial-ends" className="font-medium">
              Trial's last day
            </label>
            <Input
              id="terms-trial-ends"
              type="date"
              required
              value={draft.trialEndsOn}
              onChange={(event) => set({ trialEndsOn: event.target.value })}
            />
            <span className="text-xs text-muted-foreground">
              The day after, without a contract, the tenant becomes read only.
            </span>
          </div>
        ) : null}
        <div className={FIELD}>
          <label htmlFor="terms-starts" className="font-medium">
            Term starts
          </label>
          <Input
            id="terms-starts"
            type="date"
            required={draft.state === "active"}
            value={draft.termStartsOn}
            onChange={(event) => set({ termStartsOn: event.target.value })}
          />
        </div>
        <div className={FIELD}>
          <label htmlFor="terms-ends" className="font-medium">
            Term ends
          </label>
          <Input
            id="terms-ends"
            type="date"
            required={draft.termStartsOn !== ""}
            value={draft.termEndsOn}
            onChange={(event) => set({ termEndsOn: event.target.value })}
          />
        </div>
        <div className={FIELD}>
          <label htmlFor="terms-renewal" className="font-medium">
            Renewal
          </label>
          <select
            id="terms-renewal"
            value={draft.renewal}
            onChange={(event) =>
              set({ renewal: event.target.value as "auto" | "manual" })
            }
            className={SELECT}
          >
            <option value="auto">Renews on its own</option>
            <option value="manual">Renewed by hand</option>
          </select>
        </div>
        <div className={FIELD}>
          <label htmlFor="terms-schedule" className="font-medium">
            Billing
          </label>
          <select
            id="terms-schedule"
            value={draft.schedule}
            onChange={(event) =>
              set({ schedule: event.target.value as BillingSchedule })
            }
            className={SELECT}
          >
            {BILLING_SCHEDULES.map((choice) => (
              <option key={choice} value={choice}>
                {SCHEDULE_NAMES[choice]}
              </option>
            ))}
          </select>
        </div>
        <div className={FIELD}>
          <label htmlFor="terms-students" className="font-medium">
            Contracted students
          </label>
          <Input
            id="terms-students"
            inputMode="numeric"
            value={draft.students}
            onChange={(event) => set({ students: event.target.value })}
          />
        </div>
        <div className={FIELD}>
          <label htmlFor="terms-census" className="font-medium">
            Census day
          </label>
          <Input
            id="terms-census"
            type="date"
            value={draft.censusOn}
            onChange={(event) => set({ censusOn: event.target.value })}
          />
          <span className="text-xs text-muted-foreground">
            When students are counted against the contract.
          </span>
        </div>
        <div className={FIELD}>
          <label htmlFor="terms-notice" className="font-medium">
            Notice
          </label>
          <select
            id="terms-notice"
            value={draft.notice}
            onChange={(event) =>
              set({ notice: event.target.value as SchoolNotice | "" })
            }
            className={SELECT}
          >
            <option value="">None</option>
            {SCHOOL_NOTICES.map((code) => (
              <option key={code} value={code}>
                {NOTICE_NAMES[code]}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            What the schools' administrators are shown.
          </span>
        </div>
      </div>
    </>
  );
}
