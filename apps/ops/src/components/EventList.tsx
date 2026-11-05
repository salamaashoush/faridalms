import type { BusinessEventRow } from "@faridalms/database/business/events";

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
};

const show = (value: unknown) => {
  if (value === null || value === undefined) return "none";
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : JSON.stringify(value);
};

/** The fields a change set to something new, when the event kept both sides. */
function differences(event: BusinessEventRow): string[] {
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
      : [`${key}: ${show(before[key])} → ${show(after[key])}`],
  );
}

/** What was done to a business record, newest first, and by whom. */
export function EventList({
  events,
  names,
}: {
  events: BusinessEventRow[];
  names: Record<string, string>;
}) {
  if (events.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <ol className="divide-y rounded-lg border">
      {events.map((event) => (
        <li key={event.id} className="grid gap-1 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">
              {ACTIONS[event.action] ?? event.action}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatWhen(event.occurredAt)} ·{" "}
              {names[event.operatorId] ?? "A former operator"}
            </span>
          </div>
          <ul className="text-muted-foreground">
            {differences(event).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {event.reason ? <p>{event.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}
