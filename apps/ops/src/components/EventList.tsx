import type { BusinessEventRow } from "@faridalms/database/business/events";
import type { ChangeLogLabels } from "@faridalms/ui/system/change-log";

import { ChangeLog } from "@faridalms/ui/system/change-log";

import { formatCountry, formatDay, formatWhen } from "../format";

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
  "business.profile": "Legal details changed",
  "tax_rate.create": "VAT rate added",
};

/** How a recorded field is named to a reader; a field not named here is not shown. */
const FIELD_NAMES: Record<string, string> = {
  legalNameEn: "Legal name in English",
  legalNameAr: "Legal name in Arabic",
  taxNumber: "Tax registration number",
  commercialRegistry: "Commercial registry",
  address: "Billing address",
  country: "Country",
  currency: "Currency",
  accountOwnerId: "Account owner",
  name: "Name",
  email: "Email",
  phone: "Phone",
  roles: "Written to about",
  locale: "Writes in",
  organisation: "School or group",
  person: "Person",
  size: "Size",
  state: "Stage",
  ownerId: "Owner",
  nextStep: "Next step",
  nextStepOn: "Next step by",
  lostReason: "Why it was lost",
  termStartsOn: "Term starts",
  termEndsOn: "Term ends",
  trialEndsOn: "Trial ends",
  renewal: "Renewal",
  schedule: "Billed",
  contractedStudents: "Contracted students",
  censusOn: "Census day",
  notice: "Notice",
  standing: "Access",
  startsOn: "From",
  endsOn: "Until",
  purchaseOrder: "Purchase order",
  language: "Language",
  version: "Version",
  addressEn: "Address in English",
  addressAr: "Address in Arabic",
  website: "Website",
  bankDetailsEn: "Bank details in English",
  bankDetailsAr: "Bank details in Arabic",
  percent: "Rate",
  reverseCharge: "Reverse charge",
  validFrom: "From",
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A recorded value as a reader reads it: names for ids, days as days. */
function show(value: unknown, names: Record<string, string>, key = ""): string {
  if (key === "country" && typeof value === "string")
    return formatCountry(value);
  if (key === "percent" && typeof value === "number") return `${value}%`;
  if (value === null || value === undefined || value === "") return "none";
  if (Array.isArray(value))
    return value.length
      ? value.map((one) => show(one, names)).join(", ")
      : "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return value.toLocaleString("en");
  if (typeof value === "string") {
    if (names[value]) return names[value];
    if (ISO_DAY.test(value)) return formatDay(value);
    return value.replaceAll("_", " ");
  }
  return "changed";
}

const fields = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * The named fields a change set, from what to what when the event kept
 * both sides, or what they were set to when it kept only the result.
 */
function differences(
  event: BusinessEventRow,
  names: Record<string, string>,
): string[] {
  const before = fields(event.before);
  const after = fields(event.after);
  const kept = event.before !== null;
  return Object.keys(after).flatMap((key) => {
    const label = FIELD_NAMES[key];
    if (!label) return [];
    if (!kept) {
      const value = after[key];
      return value === null ||
        value === undefined ||
        value === "" ||
        (key === "reverseCharge" && value === false)
        ? []
        : [`${label}: ${show(value, names, key)}`];
    }
    return JSON.stringify(before[key] ?? null) ===
      JSON.stringify(after[key] ?? null)
      ? []
      : [
          `${label}: ${show(before[key], names, key)} → ${show(after[key], names, key)}`,
        ];
  });
}

const LABELS: ChangeLogLabels = {
  caption: "Changes",
  what: "Change",
  why: "Why",
  who: "By",
  when: "When",
  empty: "Nothing has changed since it was created.",
  emptyHint: "Each change shows here with who made it and why.",
};

export interface EventListProps {
  events: BusinessEventRow[];
  /** Operators' names by id, so an id in a change reads as a person. */
  names: Record<string, string>;
}

/** What was done to a business record, newest first: what, why, by whom and when. */
export function EventList({ events, names }: EventListProps) {
  return (
    <ChangeLog
      labels={LABELS}
      entries={events.map((event) => ({
        id: event.id,
        ...(event.action === "business.profile" && event.before === null
          ? { what: "Legal details set", details: [] }
          : {
              what: ACTIONS[event.action] ?? event.action,
              details: differences(event, names),
            }),
        why: event.reason,
        who: names[event.operatorId] ?? "A former operator",
        when: formatWhen(event.occurredAt),
        at: new Date(event.occurredAt).toISOString(),
      }))}
    />
  );
}
