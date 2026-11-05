import type { SchoolNotice } from "@faridalms/domain/plans";

import { daysBetween } from "@faridalms/domain/school";
import { CircleAlert } from "lucide-react";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatDate, formatNumber } from "~/utils/datetime";

const NOTICE: Record<SchoolNotice, () => string> = {
  payment_overdue: m.contractPaymentOverdue,
  plan_ends_soon: m.contractPlanEndsSoon,
};

const counted = (value: { count: number; limit: number }) => ({
  count: formatNumber(value.count),
  limit: formatNumber(value.limit),
});

/** The trial's last day and the days left until it; nothing once it is over. */
function trialLine(endsOn: string, today: string): string | null {
  if (endsOn < today) return null;
  if (endsOn === today) return m.contractTrialEndsToday();
  const days = daysBetween(today, endsOn) - 1;
  return m.contractTrialEnds({
    count: days,
    value: formatNumber(days),
    date: formatDate(endsOn, "full"),
  });
}

/** What the platform tells a school's administrators about their contract. */
export function ContractNotice() {
  const { contract, paused, today } = useCurrentUser();
  if (!contract && !paused) return null;
  const trial = contract?.trialEndsOn
    ? trialLine(contract.trialEndsOn, today)
    : null;
  const shown = [
    paused ? m.schoolPaused() : null,
    contract?.restricted ? m.contractRestricted() : null,
    contract?.notice ? NOTICE[contract.notice]() : null,
    trial,
    contract?.students
      ? m.contractOverStudents(counted(contract.students))
      : null,
    contract?.staffAccounts
      ? m.contractOverStaff(counted(contract.staffAccounts))
      : null,
    contract?.emails ? m.contractOverEmails(counted(contract.emails)) : null,
  ].filter((line) => line !== null);
  if (shown.length === 0) return null;
  return (
    <aside
      aria-label={m.contractNoticeLabel()}
      className="mb-6 flex gap-2.5 rounded-lg border bg-card px-4 py-3 text-sm"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="grid gap-0.5 text-muted-foreground">
        {shown.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </aside>
  );
}
