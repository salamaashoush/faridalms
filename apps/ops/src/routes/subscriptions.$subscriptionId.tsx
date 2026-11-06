import type { ModuleId } from "@faridalms/domain/modules";
import type { EntitlementsInput } from "@faridalms/domain/plans";
import type { LimitKey } from "@faridalms/domain/subscriptions";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { LIMIT_KEYS, usableModules } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import {
  CheckboxGroupField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import {
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt, attemptWith } from "../actions";
import { EventList } from "../components/EventList";
import {
  SCHEDULE_NAMES,
  TermsFields,
  termsDraftOf,
  termsOf,
} from "../components/TermsFields";
import { WhyField } from "../components/Why";
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
  SUBSCRIPTION_STATE_NAMES,
  SUBSCRIPTION_STATE_TONE,
  TENANT_STATE_NAMES,
  TENANT_STATE_TONE,
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
  staticData: { title: "Subscription" },
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
    <>
      <RecordHeader
        title={tenantName ?? customer.legalNameEn}
        status={{
          label: SUBSCRIPTION_STATE_NAMES[subscription.state],
          tone: SUBSCRIPTION_STATE_TONE[subscription.state],
        }}
        facts={[
          {
            label: "Customer",
            value: (
              <Link
                to="/customers/$customerId"
                params={{ customerId: customer.id }}
                className="hover:text-primary hover:underline"
              >
                {customer.legalNameEn}
              </Link>
            ),
          },
          { label: "Currency", value: `Priced in ${subscription.currency}` },
          { label: "Revision", value: `Revision ${subscription.revision}` },
          ...(subscription.grandfathered
            ? [{ label: "Grandfathered", value: "Grandfathered" }]
            : []),
        ]}
        alerts={
          subscription.grandfathered
            ? [
                {
                  label:
                    "This tenant came before the console sold anything, so its overrides keep each school as it was. To sell it a contract, set its term, add its plan, then end the overrides from the day the plan starts.",
                  tone: "info",
                  icon: Info,
                },
              ]
            : []
        }
      />
      <RecordColumns
        main={
          <>
            <Schools data={data} mayPublish={mayChange} />
            <Items data={data} mayChange={mayChange} />
            <Overrides data={data} mayChange={mayChange} />
            <Publications data={data} />
            <RecordSection title="History">
              <EventList events={history} names={names} />
            </RecordSection>
          </>
        }
        aside={
          mayChange ? <TermsForm data={data} /> : <TermsSummary data={data} />
        }
      />
    </>
  );
}

interface SubscriptionProps {
  data: Data;
}

interface ChangeableProps extends SubscriptionProps {
  mayChange: boolean;
}

/**
 * Each school as it stands and as publishing today would leave it. The
 * daily round publishes what is in force each day; publishing here applies
 * a change at once.
 */
interface SchoolsProps extends SubscriptionProps {
  mayPublish: boolean;
}

function Schools({ data, mayPublish }: SchoolsProps) {
  const router = useRouter();
  const publish = useServerFn(publishNow);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = data.schools.some(
    (school) => changesBetween(school.current, school.next).length > 0,
  );
  return (
    <>
      <RecordSection
        title="Schools"
        description="What each school has now, and what it would have if this subscription were published today. The daily round publishes each day on its own."
      >
        {data.schools.length === 0 ? (
          <RecordEmpty>The tenant has no schools in the directory.</RecordEmpty>
        ) : (
          <ul className="grid gap-3 @2xl:grid-cols-2">
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
                  className="grid content-start gap-3 rounded-lg border p-4"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/schools/$schoolId"
                      params={{ schoolId: school.id }}
                      className="text-sm leading-5 font-semibold hover:text-primary hover:underline"
                    >
                      {school.name}
                    </Link>
                    {school.tenantState === "active" ? null : (
                      <StatusBadge tone={TENANT_STATE_TONE[school.tenantState]}>
                        {TENANT_STATE_NAMES[school.tenantState]}
                      </StatusBadge>
                    )}
                    {school.access === "restricted" ? (
                      <StatusBadge tone="warning">Restricted</StatusBadge>
                    ) : null}
                  </span>
                  {changes.length ? (
                    <ul className="grid gap-1">
                      {changes.map((line) => (
                        <li key={line}>
                          <StatusText tone="info">{line}</StatusText>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      Published as it stands.
                    </p>
                  )}
                  <span className="flex flex-wrap gap-1.5">
                    {usable.map((id) => (
                      <StatusBadge key={id} tone="neutral">
                        {MODULE_NAMES[id]}
                      </StatusBadge>
                    ))}
                  </span>
                  {unusable.length ? (
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      Entitled but unusable without the modules they need:{" "}
                      {unusable.map((id) => MODULE_NAMES[id]).join(", ")}.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </RecordSection>
      {mayPublish && pending ? (
        <SettingsSection
          title="Publish"
          description="Gives the schools what the subscription says today, at once."
          submitLabel="Publish now"
          pending={saving}
          error={error}
          isDirty={() => Boolean(reason)}
          onSubmit={async () => {
            setSubmitted(true);
            if (!reason.trim()) return;
            setSaving(true);
            setError(null);
            const out = await attemptWith(
              () =>
                publish({
                  data: { id: data.subscription.id, reason: reason.trim() },
                }),
              "It could not be published.",
            );
            setSaving(false);
            if (!out.ok) {
              setError(out.message);
              return;
            }
            const count = out.value.published.length;
            const schools = `${count} ${count === 1 ? "school" : "schools"}`;
            toast.success(
              out.value.atOnce
                ? `Published to ${schools}. They have it now.`
                : `Published to ${schools}. Their cell could not be told, so they have it within a minute.`,
            );
            setReason("");
            setSubmitted(false);
            await router.invalidate();
          }}
        >
          <TextField
            label="Why now"
            hint="Kept in the change log."
            maxLength={500}
            value={reason}
            placeholder="For example: the school starts coding on Monday"
            errors={
              submitted && !reason.trim()
                ? ["Say why, for the change log."]
                : undefined
            }
            onChange={(event) => setReason(event.target.value)}
          />
        </SettingsSection>
      ) : null}
    </>
  );
}

function TermsSummary({ data }: SubscriptionProps) {
  const { subscription } = data;
  return (
    <RecordSection title="Terms">
      <p className="text-sm leading-5">
        {subscription.state === "trial" && subscription.trialEndsOn
          ? `Trial until ${formatDay(subscription.trialEndsOn)}.`
          : subscription.termStartsOn && subscription.termEndsOn
            ? `Term ${formatDay(subscription.termStartsOn)} until ${formatDay(subscription.termEndsOn)}, ${subscription.renewal === "auto" ? "renewing on its own" : "renewed by hand"}, billed ${SCHEDULE_NAMES[subscription.schedule].toLowerCase()}.`
            : "No term."}
        {subscription.contractedStudents
          ? ` Contracted for ${subscription.contractedStudents.toLocaleString("en")} students.`
          : ""}
      </p>
    </RecordSection>
  );
}

/** A trial's end, or a contract's term, renewal and billing. */
function TermsForm({ data }: SubscriptionProps) {
  const router = useRouter();
  const save = useServerFn(saveTerms);
  const { subscription, today } = data;
  const [draft, setDraft] = useState(() => termsDraftOf(subscription, today));
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <SettingsSection
      title="Terms"
      submitLabel="Save terms"
      pending={saving}
      error={answer}
      onSubmit={async () => {
        setSubmitted(true);
        const read = termsOf(draft);
        if (!read.ok) {
          setAnswer(read.message);
          return;
        }
        if (!reason.trim()) return;
        setSaving(true);
        setAnswer(null);
        const failed = await attempt(
          () =>
            save({
              data: {
                id: subscription.id,
                terms: read.terms,
                reason: reason.trim(),
              },
            }),
          "The terms could not be saved. A trial needs its end; a contract needs a term that ends after it starts.",
        );
        setSaving(false);
        if (failed) {
          setAnswer(failed);
          return;
        }
        toast.success("Terms saved.");
        setReason("");
        setSubmitted(false);
        await router.invalidate();
      }}
    >
      <TermsFields draft={draft} onChange={setDraft} />
      <WhyField
        value={reason}
        onChange={setReason}
        submitted={submitted}
        placeholder="For example: signed the order form for 2027"
      />
    </SettingsSection>
  );
}

interface EndPartsProps extends SubscriptionProps {
  part: "item" | "override";
  ids: string[];
  label: string;
}

/** Ends one or more parts from a day: today ends them at once. */
function EndParts({ data, part, ids, label }: EndPartsProps) {
  const router = useRouter();
  const end = useServerFn(endSubscriptionParts);
  const [endsOn, setEndsOn] = useState(data.today);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SettingsSection
      title={label}
      submitLabel={label}
      pending={saving}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (ids.length === 0 || !endsOn || !reason.trim()) return;
        setSaving(true);
        setError(null);
        const failed = await attempt(
          () =>
            end({
              data: {
                subscriptionId: data.subscription.id,
                part,
                ids,
                endsOn,
                reason: reason.trim(),
              },
            }),
          "It could not be ended.",
        );
        setSaving(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success(
          endsOn <= data.today
            ? "Ended. Publish for the schools to see it now."
            : `Ends ${formatDay(endsOn)}.`,
        );
        setReason("");
        setSubmitted(false);
        await router.invalidate();
      }}
    >
      <TextField
        label="First day without it"
        type="date"
        width="date"
        value={endsOn}
        onChange={(event) => setEndsOn(event.target.value)}
      />
      <WhyField value={reason} onChange={setReason} submitted={submitted} />
    </SettingsSection>
  );
}

function Items({ data, mayChange }: ChangeableProps) {
  const [ending, setEnding] = useState<string | null>(null);
  const schoolName = (id: string) =>
    data.schools.find((school) => school.id === id)?.name ?? id;
  return (
    <>
      <RecordSection title="Items">
        {data.items.length === 0 ? (
          <RecordEmpty>
            No plan or add-on: its schools have Basic, and whatever its
            overrides give.
          </RecordEmpty>
        ) : (
          <RecordList>
            {data.items.map(({ item, plan, planCode, addOn, addOnCode }) => (
              <li key={item.id} className="grid gap-1 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm leading-5 font-medium">
                    {plan
                      ? `${plan.nameEn} (${planCode}) version ${plan.version}`
                      : addOn
                        ? `${addOn.nameEn} (${addOnCode}) version ${addOn.version}`
                        : "A retired version"}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {spanOf(item)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
                    {item.quantity.toLocaleString("en")} at{" "}
                    {formatMoney(
                      item.unitPriceMinor,
                      data.subscription.currency,
                    )}
                    {Number(item.discountPercent) > 0
                      ? `, ${Number(item.discountPercent)}% off`
                      : ""}{" "}
                    ·{" "}
                    {item.schoolIds.length
                      ? item.schoolIds.map(schoolName).join(", ")
                      : "Every school"}
                  </p>
                  {mayChange && open(item, data.today) && ending !== item.id ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEnding(item.id)}
                    >
                      End…
                    </Button>
                  ) : null}
                </div>
                {ending === item.id ? (
                  <div className="mt-2">
                    <EndParts
                      data={data}
                      part="item"
                      ids={[item.id]}
                      label="End this item"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </RecordList>
        )}
      </RecordSection>
      {mayChange ? <AddItemForm data={data} /> : null}
    </>
  );
}

/** Sells the subscription a plan or add-on version, from a day. */
function AddItemForm({ data }: SubscriptionProps) {
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
  const [submitted, setSubmitted] = useState(false);
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
  const choices = [
    { value: "", label: "Choose…" },
    ...selling.plans.map((plan) => ({
      value: `plan:${plan.id}`,
      label: `Plan: ${plan.nameEn} version ${plan.version}`,
    })),
    ...selling.addOns.map((addOn) => ({
      value: `add_on:${addOn.id}`,
      label: `Add-on: ${addOn.nameEn} version ${addOn.version}`,
    })),
  ];
  return (
    <SettingsSection
      title="Add an item"
      description="A plan or add-on version, sold from a day."
      submitLabel="Add item"
      pending={saving}
      error={answer}
      onSubmit={async () => {
        setSubmitted(true);
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
        if (!reason.trim()) return;
        setSaving(true);
        setAnswer(null);
        const failed = await attempt(
          () =>
            add({
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
            }),
          "The item could not be added.",
        );
        setSaving(false);
        if (failed) {
          setAnswer(failed);
          return;
        }
        toast.success(
          startsOn <= today
            ? "Added. Publish for the schools to have it now."
            : `Added from ${formatDay(startsOn)}.`,
        );
        setChoice("");
        setReason("");
        setSubmitted(false);
        await router.invalidate();
      }}
    >
      <SelectField
        label="What"
        value={choice}
        options={choices}
        onChange={pick}
      />
      <div className="grid items-start gap-6 @md:grid-cols-2">
        <TextField
          label="Quantity"
          inputMode="numeric"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <TextField
          label={`Unit price (${subscription.currency})`}
          inputMode="decimal"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
        <TextField
          label="Discount (%)"
          inputMode="decimal"
          value={discount}
          onChange={(event) => setDiscount(event.target.value)}
        />
        <TextField
          label="Starts"
          type="date"
          value={startsOn}
          onChange={(event) => setStartsOn(event.target.value)}
        />
      </div>
      {data.schools.length > 1 ? (
        <SchoolChoice
          schools={data.schools}
          chosen={schoolIds}
          onChange={setSchoolIds}
        />
      ) : null}
      <WhyField
        value={reason}
        onChange={setReason}
        submitted={submitted}
        placeholder="For example: the order form signed on 3 November"
      />
    </SettingsSection>
  );
}

interface SchoolChoiceProps {
  schools: Data["schools"];
  chosen: string[];
  onChange: (ids: string[]) => void;
}

function SchoolChoice({ schools, chosen, onChange }: SchoolChoiceProps) {
  return (
    <CheckboxGroupField
      label="Schools"
      hint="None chosen covers every school of the tenant."
      value={chosen}
      options={schools.map((school) => ({
        value: school.id,
        label: school.name,
      }))}
      onChange={onChange}
    />
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

function Overrides({ data, mayChange }: ChangeableProps) {
  const [chosen, setChosen] = useState<string[]>([]);
  const schoolName = (id: string) =>
    data.schools.find((school) => school.id === id)?.name ?? id;
  const endable = data.overrides.filter((override) =>
    open(override, data.today),
  );
  return (
    <>
      <RecordSection
        title="Overrides"
        description="A module given or taken away, or a limit set, for one school or every school, for a while. A school's own override wins over one for every school."
        action={
          mayChange && endable.length ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setChosen(endable.map((override) => override.id))
                }
              >
                Choose all {endable.length}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setChosen([])}
              >
                Choose none
              </Button>
            </>
          ) : undefined
        }
      >
        {data.overrides.length === 0 ? (
          <RecordEmpty>No overrides.</RecordEmpty>
        ) : (
          <RecordList>
            {data.overrides.map((override) => (
              <li key={override.id} className="flex items-start gap-3 py-3">
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
                  <span className="text-sm leading-5 font-medium">
                    {describeOverride(override, schoolName)}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {spanOf(override)} · {override.reason}
                  </span>
                </div>
              </li>
            ))}
          </RecordList>
        )}
      </RecordSection>
      {mayChange && chosen.length ? (
        <EndParts
          data={data}
          part="override"
          ids={chosen}
          label={`End ${chosen.length} chosen`}
        />
      ) : null}
      {mayChange ? <AddOverrideForm data={data} /> : null}
    </>
  );
}

/** Gives or takes a module, or sets a limit, for a while and with a reason. */
function AddOverrideForm({ data }: SubscriptionProps) {
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
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const storage = isStorageKey(limitKey);
  return (
    <SettingsSection
      title="Add an override"
      submitLabel="Add override"
      pending={saving}
      error={answer}
      onSubmit={async () => {
        setSubmitted(true);
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
        if (!reason.trim()) return;
        setSaving(true);
        setAnswer(null);
        const failed = await attempt(
          () =>
            add({
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
            }),
          "The override could not be added.",
        );
        setSaving(false);
        if (failed) {
          setAnswer(failed);
          return;
        }
        toast.success(
          startsOn <= data.today
            ? "Added. Publish for the schools to have it now."
            : `Added from ${formatDay(startsOn)}.`,
        );
        setReason("");
        setValue("");
        setSubmitted(false);
        await router.invalidate();
      }}
    >
      <div className="grid items-start gap-6 @md:grid-cols-2">
        <SelectField
          label="For"
          value={schoolId}
          options={[
            { value: "", label: "Every school" },
            ...data.schools.map((school) => ({
              value: school.id,
              label: school.name,
            })),
          ]}
          onChange={setSchoolId}
        />
        <SelectField
          label="Sets"
          value={what}
          options={SETS_OPTIONS}
          onChange={setWhat}
        />
        {what === "module" ? (
          <>
            <SelectField
              label="Module"
              value={module}
              options={MODULE_OPTIONS}
              onChange={setModule}
            />
            <SelectField
              label="So the school"
              value={granted ? "give" : "take"}
              options={GRANTED_OPTIONS}
              onChange={(choice) => setGranted(choice === "give")}
            />
          </>
        ) : (
          <>
            <SelectField
              label="Limit"
              value={limitKey}
              options={LIMIT_OPTIONS}
              onChange={setLimitKey}
            />
            <TextField
              label={`Set to${storage ? " (GB)" : ""}`}
              optional={!storage}
              inputMode={storage ? "decimal" : "numeric"}
              value={value}
              placeholder={storage ? "" : "Unlimited"}
              onChange={(event) => setValue(event.target.value)}
            />
          </>
        )}
        <TextField
          label="Starts"
          type="date"
          value={startsOn}
          onChange={(event) => setStartsOn(event.target.value)}
        />
        <TextField
          label="First day without it"
          optional
          type="date"
          hint="Empty until someone ends it."
          value={endsOn}
          onChange={(event) => setEndsOn(event.target.value)}
        />
      </div>
      <WhyField
        value={reason}
        onChange={setReason}
        submitted={submitted}
        placeholder="For example: a term's pilot of badges"
      />
    </SettingsSection>
  );
}

const SETS_OPTIONS = [
  { value: "module", label: "A module" },
  { value: "limit", label: "A limit" },
] as const;

const GRANTED_OPTIONS = [
  { value: "give", label: "Has it" },
  { value: "take", label: "Does not have it" },
] as const;

const MODULE_OPTIONS = MODULE_IDS.map((choice) => ({
  value: choice,
  label: MODULE_NAMES[choice],
}));

const LIMIT_OPTIONS = LIMIT_KEYS.map((choice) => ({
  value: choice,
  label: LIMIT_NAMES[choice],
}));

/** Each write to the directory: what a school was given, when, by whom, why. */
function Publications({ data }: SubscriptionProps) {
  const schoolName = (id: string) =>
    data.schools.find((school) => school.id === id)?.name ?? id;
  return (
    <RecordSection title="Publications">
      {data.publications.length === 0 ? (
        <RecordEmpty>Not published yet.</RecordEmpty>
      ) : (
        <RecordList>
          {data.publications.map((publication) => (
            <li key={publication.id} className="grid gap-1 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-sm leading-5 font-medium">
                  {schoolName(publication.schoolId)}, from revision{" "}
                  {publication.revision}
                </span>
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {formatWhen(publication.publishedAt)} ·{" "}
                  {data.names[publication.operatorId] ?? "A former operator"}
                </span>
              </div>
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                {publication.entitlements.modules
                  .map((id) => MODULE_NAMES[id])
                  .join(", ")}
              </p>
              <p className="text-sm leading-5">{publication.reason}</p>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}
