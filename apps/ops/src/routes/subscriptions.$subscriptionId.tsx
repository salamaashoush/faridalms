import type { ModuleId } from "@faridalms/domain/modules";
import type { EntitlementsInput } from "@faridalms/domain/plans";
import type { LimitKey } from "@faridalms/domain/subscriptions";
import type { AttentionItem } from "@faridalms/ui/system/attention-list";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { RecordTab } from "@faridalms/ui/system/record-page";
import type { Tone } from "@faridalms/ui/system/status";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { netMinor } from "@faridalms/domain/money";
import { daysBetween } from "@faridalms/domain/school";
import { LIMIT_KEYS, usableModules } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { AttentionList } from "@faridalms/ui/system/attention-list";
import { CellWithNote } from "@faridalms/ui/system/cell-note";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import {
  CheckboxGroupField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { Metric, MetricGrid } from "@faridalms/ui/system/metrics";
import { Page } from "@faridalms/ui/system/page";
import { useDesignSystem } from "@faridalms/ui/system/provider";
import { RecordHeader, RecordTabs } from "@faridalms/ui/system/record-page";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { Value } from "@faridalms/ui/system/value";
import {
  createFileRoute,
  Link,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  Package,
  Pencil,
  Plus,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

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
  STANDING_NAMES,
  STANDING_TONE,
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

const SUBSCRIPTION_TABS = [
  "terms",
  "items",
  "overrides",
  "schools",
  "publications",
  "history",
] as const;
type SubscriptionTab = (typeof SUBSCRIPTION_TABS)[number];

const TAB_NAMES: Record<SubscriptionTab, string> = {
  terms: "Terms",
  items: "Items",
  overrides: "Overrides",
  schools: "Schools",
  publications: "Publications",
  history: "History",
};

const search = v.object({
  tab: v.fallback(v.optional(v.picklist(SUBSCRIPTION_TABS), "terms"), "terms"),
});

export const Route = createFileRoute("/subscriptions/$subscriptionId")({
  staticData: { title: "Subscription" },
  validateSearch: search,
  search: { middlewares: [stripSearchParams({ tab: "terms" })] },
  loader: ({ params }) =>
    getSubscription({ data: { id: params.subscriptionId } }),
  component: SubscriptionPage,
});

type Data = Awaited<ReturnType<typeof getSubscription>>;
type ItemRow = Data["items"][number] & { id: string };
type OverrideRow = Data["overrides"][number];
type SchoolRow = Data["schools"][number];
type PublicationRow = Data["publications"][number];

const GIB = 1024 ** 3;

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

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en")} ${count === 1 ? one : many}`;

/** Where a dated part stands on a day. */
type PartState = "in_force" | "starts" | "ended";

const partState = (
  span: { startsOn: string; endsOn: string | null },
  day: string,
): PartState =>
  span.startsOn > day
    ? "starts"
    : span.endsOn !== null && span.endsOn <= day
      ? "ended"
      : "in_force";

const PART_STATE_NAMES: Record<PartState, string> = {
  in_force: "In force",
  starts: "Starts later",
  ended: "Ended",
};

const PART_STATE_TONE: Record<PartState, Tone> = {
  in_force: "success",
  starts: "info",
  ended: "neutral",
};

const nameOfItem = ({ plan, addOn }: Data["items"][number]) =>
  plan
    ? `${plan.nameEn}, version ${plan.version}`
    : addOn
      ? `${addOn.nameEn}, version ${addOn.version}`
      : "A retired version";

/** What the items in force on a day come to for a term, after discounts. */
function valueOn(data: Data, day: string): number {
  return data.items
    .filter(({ item }) => partState(item, day) === "in_force")
    .reduce(
      (sum, { item }) =>
        sum +
        netMinor({
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          discountPercent: Number(item.discountPercent),
        }),
      0,
    );
}

const termText = (subscription: Data["subscription"]) =>
  subscription.state === "trial"
    ? subscription.trialEndsOn
      ? `Trial until ${formatDay(subscription.trialEndsOn)}`
      : "Trial with no end"
    : subscription.termStartsOn && subscription.termEndsOn
      ? `${formatDay(subscription.termStartsOn)} to ${formatDay(subscription.termEndsOn)}`
      : "No term set";

/**
 * One customer's contract: what it pays and until when, what needs doing,
 * then a tab for each part of it: its terms, the items sold, the
 * exceptions, what each school has, what was published and its history.
 */
function SubscriptionPage() {
  const data = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { subscription, customer, tenantName, history, names, today } = data;
  const mayChange = useMay("subscriptions") && subscription.state !== "ended";
  const publishing = useSheet();
  const changingTerms = useSheet();
  const addingItem = useSheet();
  const addingOverride = useSheet();
  const waiting = data.schools.filter(
    (school) => changesBetween(school.current, school.next).length > 0,
  );
  const plan = data.items.find(
    ({ item, plan: version }) =>
      version && partState(item, today) === "in_force",
  );
  const tabs: RecordTab<SubscriptionTab>[] = SUBSCRIPTION_TABS.map((value) => ({
    value,
    label: TAB_NAMES[value],
    count:
      value === "items"
        ? data.items.length
        : value === "overrides"
          ? data.overrides.length
          : value === "schools"
            ? data.schools.length
            : undefined,
  }));
  const go = (next: SubscriptionTab) =>
    void navigate({
      search: { tab: next },
      replace: true,
      resetScroll: false,
    });
  return (
    <Page width="record">
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
                Sold to {customer.legalNameEn}
              </Link>
            ),
          },
          {
            label: "Plan",
            value: plan?.plan
              ? plan.plan.nameEn
              : subscription.grandfathered
                ? "No plan sold yet"
                : "No plan",
          },
          { label: "Term", value: termText(subscription) },
        ]}
        action={
          mayChange && waiting.length
            ? { label: "Publish now", icon: Upload, onClick: publishing.show }
            : undefined
        }
        menu={
          mayChange
            ? [
                {
                  label: "Change the terms",
                  icon: CalendarClock,
                  onSelect: changingTerms.show,
                },
                { label: "Add item", icon: Package, onSelect: addingItem.show },
                {
                  label: "Add override",
                  icon: SlidersHorizontal,
                  onSelect: addingOverride.show,
                },
              ]
            : []
        }
      />
      <div className="grid gap-6">
        <Glance data={data} />
        <ToDo
          data={data}
          waiting={waiting}
          mayChange={mayChange}
          onPublish={publishing.show}
          onTerms={changingTerms.show}
          onItem={addingItem.show}
        />
        <RecordTabs
          label="The subscription's parts"
          tabs={tabs}
          value={tab}
          onChange={go}
        >
          {tab === "terms" ? (
            <TermsTab
              data={data}
              mayChange={mayChange}
              onEdit={changingTerms.show}
            />
          ) : tab === "items" ? (
            <ItemsTab
              data={data}
              mayChange={mayChange}
              onAdd={addingItem.show}
            />
          ) : tab === "overrides" ? (
            <OverridesTab
              data={data}
              mayChange={mayChange}
              onAdd={addingOverride.show}
            />
          ) : tab === "schools" ? (
            <SchoolsTab data={data} />
          ) : tab === "publications" ? (
            <PublicationsTab data={data} />
          ) : (
            <EventList events={history} names={names} />
          )}
        </RecordTabs>
      </div>
      {mayChange ? (
        <>
          <PublishSheet
            key={`publish-${publishing.key}`}
            data={data}
            open={publishing.open}
            onOpenChange={publishing.onOpenChange}
          />
          <TermsSheet
            key={`terms-${changingTerms.key}`}
            data={data}
            open={changingTerms.open}
            onOpenChange={changingTerms.onOpenChange}
          />
          <AddItemSheet
            key={`item-${addingItem.key}`}
            data={data}
            open={addingItem.open}
            onOpenChange={addingItem.onOpenChange}
          />
          <AddOverrideSheet
            key={`override-${addingOverride.key}`}
            data={data}
            open={addingOverride.open}
            onOpenChange={addingOverride.onOpenChange}
          />
        </>
      ) : null}
    </Page>
  );
}

interface SubscriptionProps {
  data: Data;
}

interface ChangeableProps extends SubscriptionProps {
  mayChange: boolean;
}

interface SubscriptionSheetProps extends SubscriptionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The contract in three numbers: what its items in force come to for a
 * term, how long the term or trial has left, and how many students its
 * schools have against those contracted.
 */
function Glance({ data }: SubscriptionProps) {
  const { formatNumber } = useDesignSystem();
  const { subscription, today } = data;
  const value = valueOn(data, today);
  const ends =
    subscription.state === "trial"
      ? subscription.trialEndsOn
      : subscription.termEndsOn;
  const left = ends ? daysBetween(today, ends) - 1 : null;
  const reported = data.schools.filter((school) => school.students !== null);
  const enrolled = reported.reduce(
    (sum, school) => sum + (school.students ?? 0),
    0,
  );
  const contracted = subscription.contractedStudents;
  return (
    <MetricGrid label="At a glance">
      <Metric
        label="Value a term"
        value={formatMoney(value, subscription.currency)}
        detail={{
          text:
            subscription.state === "trial"
              ? "Nothing is billed during a trial"
              : `Billed ${SCHEDULE_NAMES[subscription.schedule].toLowerCase()}, before VAT`,
        }}
      />
      <Metric
        label={subscription.state === "trial" ? "Trial ends" : "Term ends"}
        value={ends ? formatDay(ends) : "No end"}
        detail={
          left === null
            ? undefined
            : left < 0
              ? {
                  text: `Ended ${plural(-left, "day", "days")} ago`,
                  tone: "danger",
                }
              : {
                  text: `${plural(left, "day", "days")} left${subscription.state === "active" ? `, ${subscription.renewal === "auto" ? "renews on its own" : "renewed by hand"}` : ""}`,
                  tone: left <= 30 ? "warning" : undefined,
                }
        }
      />
      <Metric
        label="Students"
        value={reported.length ? formatNumber(enrolled) : "Not reported"}
        meter={
          contracted && reported.length ? enrolled / contracted : undefined
        }
        detail={{
          text: contracted
            ? `Of ${formatNumber(contracted)} contracted`
            : "No contracted number",
          tone: contracted && enrolled > contracted ? "warning" : undefined,
        }}
      />
    </MetricGrid>
  );
}

interface ToDoProps {
  data: Data;
  waiting: SchoolRow[];
  mayChange: boolean;
  onPublish: () => void;
  onTerms: () => void;
  onItem: () => void;
}

/** What the contract waits on: a publication, a trial's end, a renewal. */
function ToDo({
  data,
  waiting,
  mayChange,
  onPublish,
  onTerms,
  onItem,
}: ToDoProps) {
  const { subscription, today } = data;
  const items: AttentionItem[] = [];
  const button = (label: string, onClick: () => void) =>
    mayChange ? (
      <Button type="button" variant="outline" size="sm" onClick={onClick}>
        {label}
      </Button>
    ) : undefined;
  if (waiting.length)
    items.push({
      id: "publish",
      tone: "info",
      title: `Changes wait to be published to ${plural(waiting.length, "school", "schools")}`,
      detail: waiting
        .map(
          (school) =>
            `${school.name}: ${changesBetween(school.current, school.next).join("; ")}`,
        )
        .join(" · "),
      action: button("Publish now", onPublish),
    });
  if (subscription.state === "trial" && subscription.trialEndsOn) {
    const left = daysBetween(today, subscription.trialEndsOn) - 1;
    if (left <= 14)
      items.push({
        id: "trial",
        tone: left < 0 ? "danger" : "warning",
        title:
          left < 0
            ? `The trial ended ${formatDay(subscription.trialEndsOn)}`
            : `The trial ends in ${plural(left, "day", "days")}`,
        detail:
          "Make it a contract: set its term, then add its plan as an item.",
        action: button("Set its term", onTerms),
      });
  }
  if (
    subscription.state === "active" &&
    subscription.termEndsOn &&
    subscription.renewal === "manual"
  ) {
    const left = daysBetween(today, subscription.termEndsOn) - 1;
    if (left <= 60)
      items.push({
        id: "renew",
        tone: left <= 14 ? "warning" : "info",
        title: `The term ends in ${plural(Math.max(left, 0), "day", "days")} and does not renew on its own`,
        detail: "Agree the next term with the customer, then extend it here.",
        action: button("Extend the term", onTerms),
      });
  }
  if (
    subscription.state !== "trial" &&
    !data.items.some(({ item }) => partState(item, today) === "in_force")
  )
    items.push({
      id: "nothing-sold",
      tone: subscription.grandfathered ? "info" : "warning",
      title: subscription.grandfathered
        ? "Kept as each school was before the console sold anything"
        : "Nothing is sold in force",
      detail: subscription.grandfathered
        ? "To sell it a contract: set its term, add its plan, then end the overrides from the day the plan starts."
        : "Its schools have Basic and whatever its overrides give.",
      action: button("Add item", onItem),
    });
  return <AttentionList title="To do" items={items} />;
}

interface TermsTabProps extends ChangeableProps {
  onEdit: () => void;
}

/** The contract's terms read down a column, as they were agreed. */
function TermsTab({ data, mayChange, onEdit }: TermsTabProps) {
  const { subscription } = data;
  const trial = subscription.state === "trial";
  return (
    <SummaryList
      title="Terms"
      align="start"
      action={
        mayChange ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Change the terms"
            onClick={onEdit}
          >
            <Pencil aria-hidden />
            Edit
          </Button>
        ) : undefined
      }
      items={[
        {
          id: "kind",
          label: "Kind",
          value: trial ? "A trial" : "A contract",
        },
        ...(trial
          ? [
              {
                id: "trial",
                label: "Trial's last day",
                value: (
                  <Value>
                    {subscription.trialEndsOn
                      ? formatDay(subscription.trialEndsOn)
                      : null}
                  </Value>
                ),
              },
            ]
          : [
              {
                id: "term",
                label: "Term",
                value: termText(subscription),
              },
              {
                id: "renewal",
                label: "Renewal",
                value:
                  subscription.renewal === "auto"
                    ? "Renews on its own for another term"
                    : "Renewed by hand",
              },
              {
                id: "schedule",
                label: "Billed",
                value: SCHEDULE_NAMES[subscription.schedule],
              },
            ]),
        {
          id: "students",
          label: "Contracted students",
          value: (
            <Value>
              {subscription.contractedStudents?.toLocaleString("en") ?? null}
            </Value>
          ),
        },
        ...(subscription.censusOn
          ? [
              {
                id: "census",
                label: "Students counted on",
                value: formatDay(subscription.censusOn),
              },
            ]
          : []),
        {
          id: "currency",
          label: "Priced in",
          value: subscription.currency,
        },
        {
          id: "notice",
          label: "Notice its schools see",
          value: subscription.notice ? (
            NOTICE_NAMES[subscription.notice]
          ) : (
            <span className="text-muted-foreground">None</span>
          ),
        },
      ]}
    />
  );
}

function itemColumns(data: Data): Column<ItemRow>[] {
  const schoolName = (id: string) =>
    data.schools.find((school) => school.id === id)?.name ?? id;
  const currency = data.subscription.currency;
  return [
    {
      id: "item",
      header: "Item",
      primary: true,
      cell: (row) => (
        <span className="grid min-w-0 py-2.5">
          <span className="truncate font-medium">{nameOfItem(row)}</span>
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {row.plan ? "Plan" : "Add-on"} ·{" "}
            {row.item.schoolIds.length
              ? row.item.schoolIds.map(schoolName).join(", ")
              : "Every school"}
          </span>
        </span>
      ),
    },
    {
      id: "state",
      header: "Status",
      cell: (row) => {
        const state = partState(row.item, data.today);
        return (
          <StatusBadge tone={PART_STATE_TONE[state]}>
            {PART_STATE_NAMES[state]}
          </StatusBadge>
        );
      },
    },
    {
      id: "when",
      header: "When",
      cell: (row) =>
        row.item.endsOn
          ? `${formatDay(row.item.startsOn)} to ${formatDay(row.item.endsOn)}`
          : `From ${formatDay(row.item.startsOn)}`,
    },
    {
      id: "quantity",
      header: "Quantity",
      align: "end",
      cell: (row) => row.item.quantity.toLocaleString("en"),
    },
    {
      id: "price",
      header: "Unit price",
      align: "end",
      cell: (row) => (
        <span className="grid">
          {formatMoney(row.item.unitPriceMinor, currency)}
          {Number(row.item.discountPercent) > 0 ? (
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {Number(row.item.discountPercent)}% off
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "amount",
      header: "A term",
      align: "end",
      cell: (row) =>
        formatMoney(
          netMinor({
            quantity: row.item.quantity,
            unitPriceMinor: row.item.unitPriceMinor,
            discountPercent: Number(row.item.discountPercent),
          }),
          currency,
        ),
    },
  ];
}

const ITEM_CARD: DataTableCard<ItemRow> = {
  title: (row) => nameOfItem(row),
  fact: (row) =>
    `${row.item.quantity.toLocaleString("en")} from ${formatDay(row.item.startsOn)}`,
};

interface PartsTabProps extends ChangeableProps {
  onAdd: () => void;
}

/**
 * The plans and add-ons sold, each with its schools, its days, its price
 * and what it comes to a term; those in force are totalled under them.
 */
function ItemsTab({ data, mayChange, onAdd }: PartsTabProps) {
  const ending = useSheet();
  const [chosen, setChosen] = useState<string | null>(null);
  const rows: ItemRow[] = data.items.map((row) => ({
    ...row,
    id: row.item.id,
  }));
  const value = valueOn(data, data.today);
  const add = mayChange ? (
    <Button type="button" variant="outline" size="sm" onClick={onAdd}>
      <Plus aria-hidden />
      Add item
    </Button>
  ) : null;
  return (
    <>
      <DataTable
        caption="Items"
        rows={rows}
        columns={itemColumns(data)}
        rowLabel={nameOfItem}
        card={ITEM_CARD}
        actions={add}
        totals={
          rows.length
            ? [
                {
                  id: "value",
                  label: "In force a term",
                  cells: {
                    amount: formatMoney(value, data.subscription.currency),
                  },
                },
              ]
            : undefined
        }
        rowActions={
          mayChange
            ? (row) =>
                partState(row.item, data.today) === "ended"
                  ? []
                  : [
                      {
                        label: "End…",
                        onSelect: () => {
                          setChosen(row.item.id);
                          ending.show();
                        },
                      },
                    ]
            : undefined
        }
        empty={{
          icon: Package,
          title: "Sell it a plan",
          description:
            "With no plan or add-on its schools have Basic, and whatever its overrides give.",
          action: add,
        }}
      />
      {mayChange ? (
        <EndPartsSheet
          key={ending.key}
          data={data}
          part="item"
          ids={chosen ? [chosen] : []}
          label="End this item"
          open={ending.open}
          onOpenChange={ending.onOpenChange}
        />
      ) : null}
    </>
  );
}

function overrideColumns(data: Data): Column<OverrideRow>[] {
  const schoolName = (id: string) =>
    data.schools.find((school) => school.id === id)?.name ?? id;
  return [
    {
      id: "override",
      header: "Override",
      primary: true,
      cell: (override) => (
        <CellWithNote note={override.reason}>
          {describeOverride(override, schoolName)}
        </CellWithNote>
      ),
    },
    {
      id: "state",
      header: "Status",
      cell: (override) => {
        const state = partState(override, data.today);
        return (
          <StatusBadge tone={PART_STATE_TONE[state]}>
            {PART_STATE_NAMES[state]}
          </StatusBadge>
        );
      },
    },
    {
      id: "when",
      header: "When",
      cell: (override) =>
        override.endsOn
          ? `${formatDay(override.startsOn)} to ${formatDay(override.endsOn)}`
          : `From ${formatDay(override.startsOn)}`,
    },
  ];
}

/**
 * The exceptions to what the items give: a module given or taken away, or
 * a limit set, for one school or every school, for a while. Several are
 * ended at once by choosing them.
 */
function OverridesTab({ data, mayChange, onAdd }: PartsTabProps) {
  const ending = useSheet();
  const [chosen, setChosen] = useState<string[]>([]);
  const schoolName = (id: string) =>
    data.schools.find((school) => school.id === id)?.name ?? id;
  const add = mayChange ? (
    <Button type="button" variant="outline" size="sm" onClick={onAdd}>
      <Plus aria-hidden />
      Add override
    </Button>
  ) : null;
  return (
    <>
      <DataTable
        caption="Overrides"
        rows={data.overrides}
        columns={overrideColumns(data)}
        rowLabel={(override) => describeOverride(override, schoolName)}
        card={{
          title: (override) => describeOverride(override, schoolName),
          fact: (override) => PART_STATE_NAMES[partState(override, data.today)],
        }}
        actions={add}
        batchActions={
          mayChange
            ? [
                {
                  label: "End",
                  onSelect: (rows) => {
                    setChosen(
                      rows
                        .filter((row) => partState(row, data.today) !== "ended")
                        .map((row) => row.id),
                    );
                    ending.show();
                  },
                },
              ]
            : undefined
        }
        empty={{
          icon: SlidersHorizontal,
          title: "No overrides",
          description:
            "An override gives or takes away a module, or sets a limit, for one school or every school, for a while. A school's own override wins over one for every school.",
          action: add,
        }}
      />
      {mayChange ? (
        <EndPartsSheet
          key={ending.key}
          data={data}
          part="override"
          ids={chosen}
          label={`End ${plural(chosen.length, "override", "overrides")}`}
          open={ending.open}
          onOpenChange={ending.onOpenChange}
        />
      ) : null}
    </>
  );
}

function schoolColumns(): Column<SchoolRow>[] {
  return [
    {
      id: "school",
      header: "School",
      primary: true,
      cell: (school) => (
        <RowLink to="/schools/$schoolId" params={{ schoolId: school.id }}>
          {school.name}
        </RowLink>
      ),
    },
    {
      id: "access",
      header: "Access",
      cell: (school) =>
        school.tenantState === "active" ? (
          <StatusBadge
            tone={
              STANDING_TONE[
                school.access === "restricted" ? "restricted" : "full"
              ]
            }
          >
            {
              STANDING_NAMES[
                school.access === "restricted" ? "restricted" : "full"
              ]
            }
          </StatusBadge>
        ) : (
          <StatusBadge tone={TENANT_STATE_TONE[school.tenantState]}>
            {TENANT_STATE_NAMES[school.tenantState]}
          </StatusBadge>
        ),
    },
    {
      id: "modules",
      header: "Modules it can use",
      align: "end",
      cell: (school) =>
        `${usableModules(school.next.modules).length} of ${MODULE_IDS.length}`,
    },
    {
      id: "publishing",
      header: "On publishing",
      width: "wide",
      cell: (school) => {
        const changes = changesBetween(school.current, school.next);
        return changes.length ? (
          <span className="grid gap-0.5">
            {changes.map((line) => (
              <StatusText key={line} tone="info">
                {line}
              </StatusText>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">Nothing changes</span>
        );
      },
    },
  ];
}

/**
 * Each school the contract covers: its access, how many modules it can use
 * once published, and what publishing today would change for it.
 */
function SchoolsTab({ data }: SubscriptionProps) {
  return (
    <DataTable
      caption="Schools"
      rows={data.schools}
      columns={schoolColumns()}
      rowLabel={(school) => school.name}
      card={{
        title: (school) => school.name,
        fact: (school) =>
          changesBetween(school.current, school.next).length
            ? "Waits to be published"
            : "Published as it stands",
      }}
      empty={{
        icon: Package,
        title: "No schools",
        description: "The tenant has no schools in the directory.",
      }}
    />
  );
}

function publicationColumns(data: Data): Column<PublicationRow>[] {
  const schoolName = (id: string) =>
    data.schools.find((school) => school.id === id)?.name ?? id;
  return [
    {
      id: "school",
      header: "School",
      primary: true,
      cell: (publication) => (
        <span className="grid min-w-0 py-2.5">
          <span className="truncate font-medium">
            {schoolName(publication.schoolId)}
          </span>
          <span
            dir="auto"
            title={publication.reason}
            className="truncate text-[13px] leading-[18px] text-muted-foreground"
          >
            {publication.reason}
          </span>
        </span>
      ),
    },
    {
      id: "revision",
      header: "Revision",
      align: "end",
      cell: (publication) => publication.revision.toLocaleString("en"),
    },
    {
      id: "who",
      header: "By",
      cell: (publication) =>
        data.names[publication.operatorId] ?? "A former operator",
    },
    {
      id: "when",
      header: "When",
      align: "end",
      cell: (publication) => (
        <span className="text-muted-foreground">
          {formatWhen(publication.publishedAt)}
        </span>
      ),
    },
  ];
}

/** Each write to the directory: what a school was given, when, by whom and why. */
function PublicationsTab({ data }: SubscriptionProps) {
  const schoolName = (id: string) =>
    data.schools.find((school) => school.id === id)?.name ?? id;
  return (
    <DataTable
      caption="Publications"
      rows={data.publications}
      columns={publicationColumns(data)}
      rowLabel={(publication) => schoolName(publication.schoolId)}
      card={{
        title: (publication) => schoolName(publication.schoolId),
        fact: (publication) => formatWhen(publication.publishedAt),
      }}
      empty={{
        icon: Upload,
        title: "Not published yet",
        description:
          "The daily round publishes what the subscription says each day; Publish now does it at once.",
      }}
    />
  );
}

/** Gives the schools what the subscription says today, at once, with why. */
function PublishSheet({ data, open, onOpenChange }: SubscriptionSheetProps) {
  const router = useRouter();
  const publish = useServerFn(publishNow);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Publish now"
      submitLabel="Publish now"
      pending={saving}
      error={error}
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
        if (count === 0)
          toast.info("Nothing to publish: the schools already have it.");
        else
          toast.success(
            out.value.atOnce
              ? `Published to ${schools}. They have it now.`
              : `Published to ${schools}. Their cell could not be told, so they have it within a minute.`,
          );
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        Gives the schools what the subscription says today, at once. The daily
        round would publish it on its own.
      </p>
      <WhyField
        label="Why now"
        value={reason}
        onChange={setReason}
        submitted={submitted}
        placeholder="For example: the school starts coding on Monday"
      />
    </SheetForm>
  );
}

/** Changes a trial's end, or a contract's term, renewal and billing. */
function TermsSheet({ data, open, onOpenChange }: SubscriptionSheetProps) {
  const router = useRouter();
  const save = useServerFn(saveTerms);
  const { subscription, today } = data;
  const [draft, setDraft] = useState(() => termsDraftOf(subscription, today));
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Change the terms"
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
        onOpenChange(false);
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
    </SheetForm>
  );
}

interface EndPartsSheetProps extends SubscriptionSheetProps {
  part: "item" | "override";
  ids: string[];
  label: string;
}

/** Ends one or more parts from a day: today ends them at once. */
function EndPartsSheet({
  data,
  part,
  ids,
  label,
  open,
  onOpenChange,
}: EndPartsSheetProps) {
  const router = useRouter();
  const end = useServerFn(endSubscriptionParts);
  const [endsOn, setEndsOn] = useState(data.today);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={label}
      submitLabel={label}
      destructive
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
        onOpenChange(false);
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
    </SheetForm>
  );
}

/** Sells the subscription a plan or add-on version, from a day. */
function AddItemSheet({ data, open, onOpenChange }: SubscriptionSheetProps) {
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
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Add an item"
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
        onOpenChange(false);
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
    </SheetForm>
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

/** Gives or takes a module, or sets a limit, for a while and with a reason. */
function AddOverrideSheet({
  data,
  open,
  onOpenChange,
}: SubscriptionSheetProps) {
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
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
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
        onOpenChange(false);
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
    </SheetForm>
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
