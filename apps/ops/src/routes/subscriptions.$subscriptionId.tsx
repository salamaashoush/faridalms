import type { ModuleId } from "@faridalms/domain/modules";
import type { EntitlementsInput } from "@faridalms/domain/plans";
import type { LimitKey } from "@faridalms/domain/subscriptions";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { LIMIT_KEYS, usableModules } from "@faridalms/domain/subscriptions";
import { Badge } from "@faridalms/ui/badge";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import { EventList } from "../components/EventList";
import {
  SCHEDULE_NAMES,
  TermsFields,
  termsDraftOf,
  termsOf,
} from "../components/TermsFields";
import {
  formatDay,
  formatLimit,
  formatMoney,
  formatWhen,
  isStorageKey,
  LIMIT_NAMES,
  minorOf,
  MODULE_NAMES,
  NOTICE_NAMES,
} from "../format";
import { useMay } from "../may";
import {
  addSubscriptionItem,
  addSubscriptionOverride,
  endSubscriptionParts,
  getSubscription,
  publishNow,
  saveTerms,
} from "../server/subscriptions";

export const Route = createFileRoute("/subscriptions/$subscriptionId")({
  loader: ({ params }) =>
    getSubscription({ data: { id: params.subscriptionId } }),
  component: SubscriptionPage,
});

type Data = Awaited<ReturnType<typeof getSubscription>>;

const GIB = 1024 ** 3;

/** Whether a dated part is still in force or yet to start on the day. */
const open = (span: { endsOn: string | null }, day: string) =>
  span.endsOn === null || span.endsOn > day;

const spanOf = (span: { startsOn: string; endsOn: string | null }) =>
  span.endsOn
    ? `${formatDay(span.startsOn)} until ${formatDay(span.endsOn)}`
    : `from ${formatDay(span.startsOn)}`;

/** What publishing would change for a school, line by line. */
function changesBetween(
  current: EntitlementsInput,
  next: EntitlementsInput,
): string[] {
  const lines: string[] = [];
  const added = next.modules.filter((id) => !current.modules.includes(id));
  const removed = current.modules.filter((id) => !next.modules.includes(id));
  if (added.length)
    lines.push(`Gains ${added.map((id) => MODULE_NAMES[id]).join(", ")}`);
  if (removed.length)
    lines.push(`Loses ${removed.map((id) => MODULE_NAMES[id]).join(", ")}`);
  for (const key of LIMIT_KEYS)
    if (current[key] !== next[key])
      lines.push(
        `${LIMIT_NAMES[key]}: ${formatLimit(key, current[key])} → ${formatLimit(key, next[key])}`,
      );
  if (current.trialEndsOn !== next.trialEndsOn)
    lines.push(
      next.trialEndsOn
        ? `Trial ends ${formatDay(next.trialEndsOn)}`
        : "No longer on trial",
    );
  if (current.notice !== next.notice)
    lines.push(
      next.notice ? `Shown: ${NOTICE_NAMES[next.notice]}` : "Notice removed",
    );
  return lines;
}

function SubscriptionPage() {
  const data = Route.useLoaderData();
  const { subscription, customer, tenantName, history, names } = data;
  const mayChange = useMay("subscriptions") && subscription.state !== "ended";
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <Link
          to="/subscriptions"
          className="text-sm text-muted-foreground hover:underline"
        >
          Subscriptions
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {tenantName ?? customer.legalNameEn}
          <Badge variant="secondary">
            {subscription.state === "trial"
              ? "Trial"
              : subscription.state === "active"
                ? "Active"
                : "Ended"}
          </Badge>
          {subscription.grandfathered ? (
            <Badge variant="outline">Grandfathered</Badge>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          For{" "}
          <Link
            to="/customers/$customerId"
            params={{ customerId: customer.id }}
            className="text-foreground underline"
          >
            {customer.legalNameEn}
          </Link>{" "}
          · priced in {subscription.currency} · revision {subscription.revision}
        </p>
        {subscription.grandfathered ? (
          <p className="max-w-2xl text-sm">
            This tenant came before the console sold anything, so its overrides
            keep each school as it was. To sell it a contract, set its term, add
            its plan, then end the overrides from the day the plan starts.
          </p>
        ) : null}
      </div>
      <Schools data={data} mayPublish={mayChange} />
      {mayChange ? <TermsForm data={data} /> : <TermsSummary data={data} />}
      <Items data={data} mayChange={mayChange} />
      <Overrides data={data} mayChange={mayChange} />
      <Publications data={data} />
      <section className="grid gap-3">
        <h2 className="text-base font-semibold">History</h2>
        <EventList events={history} names={names} />
      </section>
    </div>
  );
}

/**
 * Each school as it stands and as publishing today would leave it. The
 * daily round publishes what is in force each day; publishing here applies
 * a change at once.
 */
function Schools({ data, mayPublish }: { data: Data; mayPublish: boolean }) {
  const router = useRouter();
  const publish = useServerFn(publishNow);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = data.schools.some(
    (school) => changesBetween(school.current, school.next).length > 0,
  );
  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">Schools</h2>
        <p className="text-sm text-muted-foreground">
          What each school has now, and what it would have if this subscription
          were published today. The daily round publishes each day on its own.
        </p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {data.schools.map((school) => {
          const changes = changesBetween(school.current, school.next);
          const usable = usableModules(school.next.modules);
          const unusable = school.next.modules.filter(
            (id) => !usable.includes(id),
          );
          return (
            <li
              key={school.id}
              aria-label={school.name}
              className="grid content-start gap-2 rounded-lg border p-4 text-sm"
            >
              <span className="flex flex-wrap items-center gap-2">
                <Link
                  to="/schools/$schoolId"
                  params={{ schoolId: school.id }}
                  className="font-medium underline"
                >
                  {school.name}
                </Link>
                {school.tenantState === "active" ? null : (
                  <Badge variant="outline">{school.tenantState}</Badge>
                )}
                {school.access === "restricted" ? (
                  <Badge variant="outline">Restricted</Badge>
                ) : null}
              </span>
              {changes.length ? (
                <ul className="grid gap-0.5">
                  {changes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Published as it stands.</p>
              )}
              <span className="flex flex-wrap gap-1">
                {usable.map((id) => (
                  <Badge key={id} variant="secondary">
                    {MODULE_NAMES[id]}
                  </Badge>
                ))}
              </span>
              {unusable.length ? (
                <p className="text-xs text-muted-foreground">
                  Entitled but unusable without the modules they need:{" "}
                  {unusable.map((id) => MODULE_NAMES[id]).join(", ")}.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {data.schools.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The tenant has no schools in the directory.
        </p>
      ) : null}
      {mayPublish && pending ? (
        <form
          aria-label="Publish"
          className="flex max-w-2xl flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              const out = await publish({
                data: { id: data.subscription.id, reason: reason.trim() },
              });
              const schools = `${out.published.length} ${out.published.length === 1 ? "school" : "schools"}`;
              toast.success(
                out.atOnce
                  ? `Published to ${schools}. They have it now.`
                  : `Published to ${schools}. Their cell could not be told, so they have it within a minute.`,
              );
              setReason("");
              await router.invalidate();
            } catch (error) {
              const said = failure(error, "It could not be published.");
              if (said) toast.error(said);
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="grid min-w-48 flex-1 gap-1 text-sm">
            <label htmlFor="publish-reason" className="font-medium">
              Why now
            </label>
            <Input
              id="publish-reason"
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: the school starts coding on Monday"
            />
          </div>
          <Button type="submit" disabled={saving || !reason.trim()}>
            {saving ? "Publishing…" : "Publish now"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function TermsSummary({ data }: { data: Data }) {
  const { subscription } = data;
  return (
    <section className="grid max-w-2xl gap-2 rounded-lg border p-6 text-sm">
      <h2 className="text-base font-semibold">Terms</h2>
      <p>
        {subscription.state === "trial" && subscription.trialEndsOn
          ? `Trial until ${formatDay(subscription.trialEndsOn)}.`
          : subscription.termStartsOn && subscription.termEndsOn
            ? `Term ${formatDay(subscription.termStartsOn)} until ${formatDay(subscription.termEndsOn)}, ${subscription.renewal === "auto" ? "renewing on its own" : "renewed by hand"}, billed ${SCHEDULE_NAMES[subscription.schedule].toLowerCase()}.`
            : "No term."}
        {subscription.contractedStudents
          ? ` Contracted for ${subscription.contractedStudents.toLocaleString("en")} students.`
          : ""}
      </p>
    </section>
  );
}

/** A trial's end, or a contract's term, renewal and billing. */
function TermsForm({ data }: { data: Data }) {
  const router = useRouter();
  const save = useServerFn(saveTerms);
  const { subscription, today } = data;
  const [draft, setDraft] = useState(() => termsDraftOf(subscription, today));
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <form
      aria-label="Terms"
      className="grid max-w-2xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const read = termsOf(draft);
        if (!read.ok) {
          setAnswer(read.message);
          return;
        }
        setSaving(true);
        setAnswer(null);
        try {
          const out = await save({
            data: {
              id: subscription.id,
              terms: read.terms,
              reason: reason.trim(),
            },
          });
          if (out.ok) {
            toast.success("Terms saved.");
            setReason("");
            await router.invalidate();
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(
            failure(
              error,
              "The terms could not be saved. A trial needs its end; a contract needs a term that ends after it starts.",
            ),
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 className="text-base font-semibold">Terms</h2>
      <TermsFields draft={draft} onChange={setDraft} />
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="terms-reason" className="font-medium">
          Why
        </label>
        <Textarea
          id="terms-reason"
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="For example: signed the order form for 2027"
        />
      </div>
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={saving || !reason.trim()}
        className="justify-self-start"
      >
        {saving ? "Saving…" : "Save terms"}
      </Button>
    </form>
  );
}

/** Ends one or more parts from a day: today ends them at once. */
function EndParts({
  data,
  part,
  ids,
  label,
}: {
  data: Data;
  part: "item" | "override";
  ids: string[];
  label: string;
}) {
  const router = useRouter();
  const end = useServerFn(endSubscriptionParts);
  const [endsOn, setEndsOn] = useState(data.today);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      aria-label={label}
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          const out = await end({
            data: {
              subscriptionId: data.subscription.id,
              part,
              ids,
              endsOn,
              reason: reason.trim(),
            },
          });
          if (out.ok) {
            toast.success(
              endsOn <= data.today
                ? "Ended. Publish for the schools to see it now."
                : `Ends ${formatDay(endsOn)}.`,
            );
            setReason("");
            await router.invalidate();
          } else toast.error(out.message);
        } catch (error) {
          const said = failure(error, "It could not be ended.");
          if (said) toast.error(said);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid gap-1 text-sm">
        <label htmlFor={`${part}-end-on`} className="font-medium">
          First day without it
        </label>
        <Input
          id={`${part}-end-on`}
          type="date"
          required
          value={endsOn}
          onChange={(event) => setEndsOn(event.target.value)}
        />
      </div>
      <div className="grid min-w-48 flex-1 gap-1 text-sm">
        <label htmlFor={`${part}-end-reason`} className="font-medium">
          Why
        </label>
        <Input
          id={`${part}-end-reason`}
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={saving || ids.length === 0 || !reason.trim()}
      >
        {saving ? "Ending…" : label}
      </Button>
    </form>
  );
}

function Items({ data, mayChange }: { data: Data; mayChange: boolean }) {
  const [ending, setEnding] = useState<string | null>(null);
  const schoolName = (id: string) =>
    data.schools.find((school) => school.id === id)?.name ?? id;
  return (
    <section className="grid gap-3">
      <h2 className="text-base font-semibold">Items</h2>
      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No plan or add-on: its schools have Basic, and whatever its overrides
          give.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.items.map(({ item, plan, planCode, addOn, addOnCode }) => (
            <li key={item.id} className="grid gap-2 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {plan
                    ? `${plan.nameEn} (${planCode}) version ${plan.version}`
                    : addOn
                      ? `${addOn.nameEn} (${addOnCode}) version ${addOn.version}`
                      : "A retired version"}
                </span>
                <span className="text-muted-foreground">{spanOf(item)}</span>
              </div>
              <p className="text-muted-foreground">
                {item.quantity.toLocaleString("en")} at{" "}
                {formatMoney(item.unitPriceMinor, data.subscription.currency)}
                {Number(item.discountPercent) > 0
                  ? `, ${Number(item.discountPercent)}% off`
                  : ""}{" "}
                ·{" "}
                {item.schoolIds.length
                  ? item.schoolIds.map(schoolName).join(", ")
                  : "Every school"}
              </p>
              {mayChange && open(item, data.today) ? (
                ending === item.id ? (
                  <EndParts
                    data={data}
                    part="item"
                    ids={[item.id]}
                    label="End this item"
                  />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-self-start"
                    onClick={() => setEnding(item.id)}
                  >
                    End…
                  </Button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {mayChange ? <AddItemForm data={data} /> : null}
    </section>
  );
}

/** Sells the subscription a plan or add-on version, from a day. */
function AddItemForm({ data }: { data: Data }) {
  const router = useRouter();
  const add = useServerFn(addSubscriptionItem);
  const { selling, subscription, today } = data;
  const [choice, setChoice] = useState("");
  const [quantity, setQuantity] = useState(
    subscription.contractedStudents?.toString() ?? "1",
  );
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [startsOn, setStartsOn] = useState(subscription.termStartsOn ?? today);
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [kind, id] = choice.split(":") as ["plan" | "add_on" | "", string];
  const chosen =
    kind === "plan"
      ? selling.plans.find((plan) => plan.id === id)
      : selling.addOns.find((addOn) => addOn.id === id);
  const pick = (value: string) => {
    setChoice(value);
    const [nextKind, nextId] = value.split(":");
    const version =
      nextKind === "plan"
        ? selling.plans.find((plan) => plan.id === nextId)
        : selling.addOns.find((addOn) => addOn.id === nextId);
    const listed = version?.prices.find(
      (row) => row.currency === subscription.currency,
    );
    setPrice(listed ? (listed.amountMinor / 100).toFixed(2) : "");
  };
  return (
    <form
      aria-label="Add an item"
      className="grid max-w-2xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const unitPriceMinor = minorOf(price);
        const count = Number(quantity);
        const off = Number(discount || "0");
        if (!chosen) {
          setAnswer("Choose a plan or add-on.");
          return;
        }
        if (unitPriceMinor === null || !Number.isInteger(count) || count < 1) {
          setAnswer("Give a quantity and a unit price.");
          return;
        }
        if (!Number.isFinite(off) || off < 0 || off > 100) {
          setAnswer("A discount is between 0 and 100 per cent.");
          return;
        }
        setSaving(true);
        setAnswer(null);
        try {
          const out = await add({
            data: {
              subscriptionId: subscription.id,
              planVersionId: kind === "plan" ? id : null,
              addOnVersionId: kind === "add_on" ? id : null,
              quantity: count,
              unitPriceMinor,
              discountPercent: off,
              schoolIds,
              startsOn,
              reason: reason.trim(),
            },
          });
          if (out.ok) {
            toast.success(
              startsOn <= today
                ? "Added. Publish for the schools to have it now."
                : `Added from ${formatDay(startsOn)}.`,
            );
            setChoice("");
            setReason("");
            await router.invalidate();
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(failure(error, "The item could not be added."));
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3 className="text-sm font-semibold">Add a plan or add-on</h3>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 text-sm sm:col-span-2">
          <label htmlFor="item-what" className="font-medium">
            What
          </label>
          <select
            id="item-what"
            required
            value={choice}
            onChange={(event) => pick(event.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Choose…</option>
            <optgroup label="Plans">
              {selling.plans.map((plan) => (
                <option key={plan.id} value={`plan:${plan.id}`}>
                  {plan.nameEn} version {plan.version}
                </option>
              ))}
            </optgroup>
            <optgroup label="Add-ons">
              {selling.addOns.map((addOn) => (
                <option key={addOn.id} value={`add_on:${addOn.id}`}>
                  {addOn.nameEn} version {addOn.version}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="item-quantity" className="font-medium">
            Quantity
          </label>
          <Input
            id="item-quantity"
            inputMode="numeric"
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="item-price" className="font-medium">
            Unit price ({subscription.currency})
          </label>
          <Input
            id="item-price"
            inputMode="decimal"
            required
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="item-discount" className="font-medium">
            Discount (%)
          </label>
          <Input
            id="item-discount"
            inputMode="decimal"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="item-starts" className="font-medium">
            Starts
          </label>
          <Input
            id="item-starts"
            type="date"
            required
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
          />
        </div>
      </div>
      {data.schools.length > 1 ? (
        <SchoolChoice
          prefix="item"
          schools={data.schools}
          chosen={schoolIds}
          onChange={setSchoolIds}
        />
      ) : null}
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="item-reason" className="font-medium">
          Why
        </label>
        <Input
          id="item-reason"
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="For example: the order form signed on 3 November"
        />
      </div>
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={saving || !reason.trim()}
        className="justify-self-start"
      >
        {saving ? "Adding…" : "Add item"}
      </Button>
    </form>
  );
}

function SchoolChoice({
  prefix,
  schools,
  chosen,
  onChange,
}: {
  prefix: string;
  schools: Data["schools"];
  chosen: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="grid gap-2 text-sm">
      <legend className="mb-1 font-medium">Schools</legend>
      <p className="text-xs text-muted-foreground">
        None chosen covers every school of the tenant.
      </p>
      {schools.map((school) => (
        <span key={school.id} className="flex items-center gap-2">
          <Checkbox
            id={`${prefix}-school-${school.id}`}
            checked={chosen.includes(school.id)}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...chosen, school.id]
                  : chosen.filter((id) => id !== school.id),
              )
            }
          />
          <label htmlFor={`${prefix}-school-${school.id}`}>{school.name}</label>
        </span>
      ))}
    </fieldset>
  );
}

function describeOverride(
  override: Data["overrides"][number],
  schoolName: (id: string) => string,
): string {
  const who = override.schoolId
    ? schoolName(override.schoolId)
    : "Every school";
  if (override.module)
    return `${who}: ${override.granted ? "gives" : "takes away"} ${MODULE_NAMES[override.module]}`;
  if (override.limitKey)
    return `${who}: ${LIMIT_NAMES[override.limitKey]} ${formatLimit(override.limitKey, override.value)}`;
  return who;
}

function Overrides({ data, mayChange }: { data: Data; mayChange: boolean }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const schoolName = (id: string) =>
    data.schools.find((school) => school.id === id)?.name ?? id;
  const endable = data.overrides.filter((override) =>
    open(override, data.today),
  );
  return (
    <section className="grid gap-3">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">Overrides</h2>
        <p className="text-sm text-muted-foreground">
          A module given or taken away, or a limit set, for one school or every
          school, for a while. A school's own override wins over one for every
          school.
        </p>
      </div>
      {data.overrides.length === 0 ? (
        <p className="text-sm text-muted-foreground">No overrides.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.overrides.map((override) => (
            <li
              key={override.id}
              className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm"
            >
              {mayChange && open(override, data.today) ? (
                <Checkbox
                  aria-label={`Choose: ${describeOverride(override, schoolName)}`}
                  checked={chosen.includes(override.id)}
                  onCheckedChange={(checked) =>
                    setChosen((current) =>
                      checked
                        ? [...current, override.id]
                        : current.filter((id) => id !== override.id),
                    )
                  }
                  className="mt-0.5"
                />
              ) : null}
              <div className="grid flex-1 gap-0.5">
                <span className="font-medium">
                  {describeOverride(override, schoolName)}
                </span>
                <span className="text-muted-foreground">
                  {spanOf(override)} · {override.reason}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {mayChange && endable.length ? (
        <div className="grid max-w-2xl gap-2">
          <span className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setChosen(endable.map((override) => override.id))}
            >
              Choose all {endable.length}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setChosen([])}>
              Choose none
            </Button>
          </span>
          <EndParts
            data={data}
            part="override"
            ids={chosen}
            label={`End ${chosen.length} chosen`}
          />
        </div>
      ) : null}
      {mayChange ? <AddOverrideForm data={data} /> : null}
    </section>
  );
}

/** Gives or takes a module, or sets a limit, for a while and with a reason. */
function AddOverrideForm({ data }: { data: Data }) {
  const router = useRouter();
  const add = useServerFn(addSubscriptionOverride);
  const [schoolId, setSchoolId] = useState("");
  const [what, setWhat] = useState<"module" | "limit">("module");
  const [module, setModule] = useState<ModuleId>("coding");
  const [granted, setGranted] = useState(true);
  const [limitKey, setLimitKey] = useState<LimitKey>("students");
  const [value, setValue] = useState("");
  const [startsOn, setStartsOn] = useState(data.today);
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const storage = isStorageKey(limitKey);
  const select = "h-9 rounded-md border bg-background px-2 text-sm";
  return (
    <form
      aria-label="Add an override"
      className="grid max-w-2xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        let limit: number | null = null;
        if (what === "limit" && value.trim() !== "") {
          const typed = Number(value);
          if (!Number.isFinite(typed) || typed < 0) {
            setAnswer("A limit is a number, or empty for unlimited.");
            return;
          }
          limit = Math.round(storage ? typed * GIB : typed);
        }
        if (what === "limit" && storage && !limit) {
          setAnswer("Storage always has a size.");
          return;
        }
        setSaving(true);
        setAnswer(null);
        try {
          const out = await add({
            data: {
              subscriptionId: data.subscription.id,
              schoolId: schoolId || null,
              module: what === "module" ? module : null,
              granted: what === "module" ? granted : null,
              limitKey: what === "limit" ? limitKey : null,
              value: what === "limit" ? limit : null,
              startsOn,
              endsOn: endsOn || null,
              reason: reason.trim(),
            },
          });
          if (out.ok) {
            toast.success(
              startsOn <= data.today
                ? "Added. Publish for the schools to have it now."
                : `Added from ${formatDay(startsOn)}.`,
            );
            setReason("");
            setValue("");
            await router.invalidate();
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(failure(error, "The override could not be added."));
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3 className="text-sm font-semibold">Add an override</h3>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="override-school" className="font-medium">
            For
          </label>
          <select
            id="override-school"
            value={schoolId}
            onChange={(event) => setSchoolId(event.target.value)}
            className={select}
          >
            <option value="">Every school</option>
            {data.schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="override-sets" className="font-medium">
            Sets
          </label>
          <select
            id="override-sets"
            value={what}
            onChange={(event) =>
              setWhat(event.target.value as "module" | "limit")
            }
            className={select}
          >
            <option value="module">A module</option>
            <option value="limit">A limit</option>
          </select>
        </div>
        {what === "module" ? (
          <>
            <div className="grid gap-1.5 text-sm">
              <label htmlFor="override-module" className="font-medium">
                Module
              </label>
              <select
                id="override-module"
                value={module}
                onChange={(event) => setModule(event.target.value as ModuleId)}
                className={select}
              >
                {MODULE_IDS.map((choice) => (
                  <option key={choice} value={choice}>
                    {MODULE_NAMES[choice]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 text-sm">
              <label htmlFor="override-granted" className="font-medium">
                So the school
              </label>
              <select
                id="override-granted"
                value={granted ? "give" : "take"}
                onChange={(event) => setGranted(event.target.value === "give")}
                className={select}
              >
                <option value="give">Has it</option>
                <option value="take">Does not have it</option>
              </select>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-1.5 text-sm">
              <label htmlFor="override-limit" className="font-medium">
                Limit
              </label>
              <select
                id="override-limit"
                value={limitKey}
                onChange={(event) =>
                  setLimitKey(event.target.value as LimitKey)
                }
                className={select}
              >
                {LIMIT_KEYS.map((choice) => (
                  <option key={choice} value={choice}>
                    {LIMIT_NAMES[choice]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 text-sm">
              <label htmlFor="override-value" className="font-medium">
                Set to{storage ? " (GB)" : ""}
              </label>
              <Input
                id="override-value"
                inputMode={storage ? "decimal" : "numeric"}
                required={storage}
                value={value}
                placeholder={storage ? "" : "Unlimited"}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
          </>
        )}
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="override-starts" className="font-medium">
            Starts
          </label>
          <Input
            id="override-starts"
            type="date"
            required
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="override-ends" className="font-medium">
            First day without it
          </label>
          <Input
            id="override-ends"
            type="date"
            value={endsOn}
            onChange={(event) => setEndsOn(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            Empty until someone ends it.
          </span>
        </div>
      </div>
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="override-reason" className="font-medium">
          Why
        </label>
        <Input
          id="override-reason"
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="For example: a term's pilot of badges"
        />
      </div>
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={saving || !reason.trim()}
        className="justify-self-start"
      >
        {saving ? "Adding…" : "Add override"}
      </Button>
    </form>
  );
}

/** Each write to the directory: what a school was given, when, by whom, why. */
function Publications({ data }: { data: Data }) {
  const schoolName = (id: string) =>
    data.schools.find((school) => school.id === id)?.name ?? id;
  return (
    <section className="grid gap-3">
      <h2 className="text-base font-semibold">Publications</h2>
      {data.publications.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not published yet.</p>
      ) : (
        <ol className="divide-y rounded-lg border">
          {data.publications.map((publication) => (
            <li key={publication.id} className="grid gap-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {schoolName(publication.schoolId)}, from revision{" "}
                  {publication.revision}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatWhen(publication.publishedAt)} ·{" "}
                  {data.names[publication.operatorId] ?? "A former operator"}
                </span>
              </div>
              <p className="text-muted-foreground">
                {publication.entitlements.modules
                  .map((id) => MODULE_NAMES[id])
                  .join(", ")}
              </p>
              <p>{publication.reason}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
