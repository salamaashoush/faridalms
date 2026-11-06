import type { BusinessEventRow } from "@faridalms/database/business/events";

import { RecordEmpty, RecordList } from "@faridalms/ui/system/record-page";

import { formatWhen } from "../format";

const ACTIONS: Record<string, string> = {
  "customer.create": "Customer created",
  "customer.update": "Details changed",
  "customer.terms": "Terms accepted",
  "customer.dpa": "Data processing agreement accepted",
  "contact.create": "Contact added",
  "contact.update": "Contact changed",
  "contact.remove": "Contact removed",
  "subscription.create": "Subscription opened",
  "subscription.grandfather": "Kept as the school had it",
  "subscription.terms": "Terms changed",
  "subscription.item_add": "Item added",
  "subscription.item_end": "Items ended",
  "subscription.override_add": "Override added",
  "subscription.override_end": "Overrides ended",
  "customer.tenant": "Runs its tenant",
  "lead.create": "Lead added",
  "lead.update": "Details changed",
  "lead.state": "Moved",
  "lead.plan": "Next step set",
  "invoice.draft": "Drafted",
  "invoice.update": "Draft changed",
  "invoice.issue": "Issued",
  "invoice.credit": "Credited",
  "invoice.tax_id": "Tax authority's id recorded",
  "invoice.payment_link": "Payment link made",
  "payment.record": "Payment recorded",
  "payment.allocate": "Payment settled against invoices",
  "subscription.notice": "Notice changed",
  "customer.owner": "Account owner changed",
  "dunning.pause": "Reminders paused",
  "dunning.pause_end": "Pause ended",
  "dunning.standing": "Access changed for an unpaid invoice",
  "task.create": "Task added",
  "task.done": "Task done",
};

const show = (value: unknown, names: Record<string, string>) => {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string" && names[value]) return names[value];
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : JSON.stringify(value);
};

/**
 * The fields a change set to something new, when the event kept both
 * sides; an operator's id reads as their name.
 */
function differences(
  event: BusinessEventRow,
  names: Record<string, string>,
): string[] {
  const before = event.before;
  const after = event.after;
  if (
    !before ||
    !after ||
    typeof before !== "object" ||
    typeof after !== "object" ||
    Array.isArray(before) ||
    Array.isArray(after)
  )
    return [];
  return Object.keys(after).flatMap((key) =>
    JSON.stringify(before[key] ?? null) === JSON.stringify(after[key] ?? null)
      ? []
      : [`${key}: ${show(before[key], names)} → ${show(after[key], names)}`],
  );
}

export interface EventListProps {
  events: BusinessEventRow[];
  /** Operators' names by id, so an id in a change reads as a person. */
  names: Record<string, string>;
}

/** What was done to a business record, newest first, and by whom. */
export function EventList({ events, names }: EventListProps) {
  if (events.length === 0) return <RecordEmpty>Nothing yet.</RecordEmpty>;
  return (
    <RecordList>
      {events.map((event) => {
        const moved = differences(event, names);
        return (
          <li key={event.id} className="grid gap-1 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-sm leading-5 font-medium">
                {ACTIONS[event.action] ?? event.action}
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {formatWhen(event.occurredAt)} ·{" "}
                {names[event.operatorId] ?? "A former operator"}
              </span>
            </div>
            {moved.length ? (
              <ul className="grid gap-0.5 text-[13px] leading-[18px] text-muted-foreground">
                {moved.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {event.reason ? (
              <p className="text-sm leading-5">{event.reason}</p>
            ) : null}
          </li>
        );
      })}
    </RecordList>
  );
}
