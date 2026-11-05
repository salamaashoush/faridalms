import type { SchoolNotice } from "@faridalms/domain/plans";

import { CircleAlert } from "lucide-react";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatDate } from "~/utils/datetime";

const NOTICE: Record<SchoolNotice, () => string> = {
  payment_overdue: m.contractPaymentOverdue,
  plan_ends_soon: m.contractPlanEndsSoon,
};

/** What the platform tells a school's administrators about their contract. */
export function ContractNotice() {
  const { contract, today } = useCurrentUser();
  if (!contract) return null;
  const trial =
    contract.trialEndsOn && contract.trialEndsOn >= today
      ? m.contractTrialEnds({ date: formatDate(contract.trialEndsOn, "full") })
      : null;
  const shown = [
    contract.notice ? NOTICE[contract.notice]() : null,
    trial,
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
