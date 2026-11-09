import type { SubscriptionState } from "@faridalms/domain/subscriptions";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { daysBetween } from "@faridalms/domain/school";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import {
  createFileRoute,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Play, Repeat } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attempt } from "../actions";
import {
  formatDay,
  formatMoney,
  formatWhen,
  SUBSCRIPTION_STATE_NAMES,
  SUBSCRIPTION_STATE_TONE,
} from "../format";
import { useMay } from "../may";
import { getSubscriptions, runDailyRound } from "../server/subscriptions";

const OPEN_STATES = ["trial", "active"] as const;

const search = v.object({
  q: v.optional(v.string(), ""),
  state: v.optional(v.array(v.picklist(OPEN_STATES)), []),
});

export const Route = createFileRoute("/subscriptions/")({
  validateSearch: search,
  search: { middlewares: [stripSearchParams({ q: "", state: [] })] },
  loader: () => getSubscriptions(),
  component: Subscriptions,
});

type Data = Awaited<ReturnType<typeof getSubscriptions>>;
type SubscriptionRow = Data["subscriptions"][number];

const nameOf = (row: SubscriptionRow) => row.tenantName ?? row.customerName;

const endOf = (row: SubscriptionRow) =>
  row.state === "trial" ? row.trialEndsOn : row.termEndsOn;

function columnsFor(today: string): Column<SubscriptionRow>[] {
  return [
    {
      id: "tenant",
      header: "Customer",
      primary: true,
      cell: (row) => (
        <span className="grid min-w-0">
          <RowLink
            to="/subscriptions/$subscriptionId"
            params={{ subscriptionId: row.id }}
          >
            {nameOf(row)}
          </RowLink>
          {row.tenantName && row.tenantName !== row.customerName ? (
            <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
              {row.customerName}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "plan",
      header: "Plan",
      cell: (row) =>
        row.plan ?? (
          <span className="text-muted-foreground">
            {row.grandfathered ? "No plan sold yet" : "No plan"}
          </span>
        ),
    },
    {
      id: "state",
      header: "Status",
      cell: (row) => (
        <StatusBadge tone={SUBSCRIPTION_STATE_TONE[row.state]}>
          {SUBSCRIPTION_STATE_NAMES[row.state]}
        </StatusBadge>
      ),
    },
    {
      id: "students",
      header: "Students",
      align: "end",
      cell: (row) =>
        row.enrolled === null ? (
          <Value absent="Not reported" />
        ) : row.contractedStudents ? (
          <span
            className={
              row.enrolled > row.contractedStudents
                ? "text-warning-foreground dark:text-warning"
                : undefined
            }
          >
            {row.enrolled.toLocaleString("en")} of{" "}
            {row.contractedStudents.toLocaleString("en")}
          </span>
        ) : (
          row.enrolled.toLocaleString("en")
        ),
    },
    {
      id: "value",
      header: "Value a term",
      align: "end",
      cell: (row) =>
        row.valueMinor ? (
          formatMoney(row.valueMinor, row.currency)
        ) : (
          <Value absent="Nothing" />
        ),
    },
    {
      id: "ends",
      header: "Ends",
      align: "end",
      cell: (row) => {
        const ends = endOf(row);
        if (!ends) return <Value absent="No end" />;
        const left = daysBetween(today, ends) - 1;
        return (
          <span className="grid justify-items-end">
            {formatDay(ends)}
            <StatusText
              tone={left < 0 ? "danger" : left <= 30 ? "warning" : "neutral"}
            >
              {left < 0
                ? `${(-left).toLocaleString("en")} days ago`
                : `${left.toLocaleString("en")} days left`}
            </StatusText>
          </span>
        );
      },
    },
  ];
}

const CARD: DataTableCard<SubscriptionRow> = {
  title: (row) => (
    <RowLink
      to="/subscriptions/$subscriptionId"
      params={{ subscriptionId: row.id }}
    >
      {nameOf(row)}
    </RowLink>
  ),
  status: (row) => (
    <StatusBadge tone={SUBSCRIPTION_STATE_TONE[row.state]}>
      {SUBSCRIPTION_STATE_NAMES[row.state]}
    </StatusBadge>
  ),
  fact: (row) => {
    const ends = endOf(row);
    return ends ? `Ends ${formatDay(ends)}` : (row.plan ?? "No plan");
  },
};

/** When the daily round last ran, and what it did, in a sentence. */
function roundText(round: Data["round"], names: Data["names"]): string {
  if (!round) return "The daily round has not run yet.";
  const { outcome } = round;
  return `The daily round last ran ${formatWhen(round.at)}, by ${names[round.by] ?? "a former operator"}: ${outcome.grandfathered} given a subscription, ${outcome.published} schools published, ${outcome.paused} trials paused, ${outcome.leadsDeleted} lost leads deleted${outcome.failed.length ? `, ${outcome.failed.length} could not be finished and are logged` : ""}.`;
}

/**
 * What every customer holds now, ordered by what ends next, so a trial to
 * convert or a term to renew comes first. Running the daily round is the
 * page's action; when it last ran is its description.
 */
function Subscriptions() {
  const { subscriptions, round, names, today } = Route.useLoaderData();
  const { q, state } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const mayRun = useMay("lifecycle");
  const run = useServerFn(runDailyRound);
  const [running, setRunning] = useState(false);
  const runRound = async () => {
    setRunning(true);
    const failed = await attempt(() => run(), "The round could not run.");
    setRunning(false);
    if (failed) toast.error(failed);
    else {
      toast.success("The round ran.");
      await router.invalidate();
    }
  };
  const needle = q.trim().toLowerCase();
  const rows = subscriptions.filter(
    (row) =>
      (!needle ||
        [row.customerName, row.tenantName, row.plan]
          .filter((text) => text !== null)
          .some((text) => text.toLowerCase().includes(needle))) &&
      (state.length === 0 || state.includes(row.state as "trial" | "active")),
  );
  const facets: Facet[] = [
    {
      id: "state",
      label: "Status",
      options: OPEN_STATES.map((value: SubscriptionState) => ({
        value,
        label: SUBSCRIPTION_STATE_NAMES[value],
        count: subscriptions.filter((row) => row.state === value).length,
      })),
      selected: state,
      onChange: (selected) =>
        void navigate({
          search: (previous) => ({
            ...previous,
            state: OPEN_STATES.filter((value) => selected.includes(value)),
          }),
          replace: true,
        }),
    },
  ];
  return (
    <Page width="list">
      <PageHeader
        title="Subscriptions"
        count={needle || state.length ? undefined : subscriptions.length}
        description={roundText(round, names)}
        action={
          mayRun
            ? {
                label: running ? "Running…" : "Run the round now",
                icon: Play,
                onClick: () => {
                  if (!running) void runRound();
                },
              }
            : undefined
        }
      />
      <DataTable
        caption="Subscriptions"
        rows={rows}
        columns={columnsFor(today)}
        rowLabel={nameOf}
        card={CARD}
        toolbar={{
          search: {
            value: q,
            onChange: (value) =>
              void navigate({
                search: (previous) => ({ ...previous, q: value }),
                replace: true,
              }),
            label: "Search subscriptions",
            placeholder: "Search by customer or plan",
          },
          facets,
          onReset: () => void navigate({ search: {} }),
        }}
        empty={{
          icon: Repeat,
          title: "No subscriptions yet",
          description:
            "New school opens one for each customer; the daily round gives every tenant without one a subscription that keeps what its schools have.",
        }}
      />
    </Page>
  );
}
