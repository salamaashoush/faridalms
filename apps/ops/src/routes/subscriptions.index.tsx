import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { Button } from "@faridalms/ui/button";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Play, Repeat } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import {
  formatDay,
  formatWhen,
  SUBSCRIPTION_STATE_NAMES,
  SUBSCRIPTION_STATE_TONE,
} from "../format";
import { useMay } from "../may";
import { getSubscriptions, runDailyRound } from "../server/subscriptions";

export const Route = createFileRoute("/subscriptions/")({
  loader: () => getSubscriptions(),
  component: Subscriptions,
});

type Data = Awaited<ReturnType<typeof getSubscriptions>>;

type SubscriptionRow = Data["subscriptions"][number];

const nameOf = (row: SubscriptionRow) => row.tenantName ?? row.customerName;

function columnsFor(today: string): Column<SubscriptionRow>[] {
  return [
    {
      id: "tenant",
      header: "Tenant",
      primary: true,
      cell: (row) => (
        <RowLink
          to="/subscriptions/$subscriptionId"
          params={{ subscriptionId: row.id }}
        >
          {nameOf(row)}
        </RowLink>
      ),
    },
    { id: "customer", header: "Customer", cell: (row) => row.customerName },
    {
      id: "holds",
      header: "Holds",
      cell: (row) => (
        <span className="flex items-center gap-1.5">
          <StatusBadge tone={SUBSCRIPTION_STATE_TONE[row.state]}>
            {SUBSCRIPTION_STATE_NAMES[row.state]}
          </StatusBadge>
          {row.grandfathered ? (
            <StatusBadge tone="neutral">Grandfathered</StatusBadge>
          ) : null}
        </span>
      ),
    },
    {
      id: "ends",
      header: "Ends",
      cell: (row) => {
        const ends = row.trialEndsOn ?? row.termEndsOn;
        if (!ends) return <span className="text-muted-foreground">No end</span>;
        return row.state === "trial" && ends < today ? (
          <StatusText tone="danger">{formatDay(ends)}, trial over</StatusText>
        ) : (
          <span className="text-muted-foreground">{formatDay(ends)}</span>
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
  fact: (row) => row.customerName,
};

/**
 * What each tenant holds now: trials first by when they end, then contracts
 * by when their term ends. A subscription sets what its schools may use.
 */
function Subscriptions() {
  const { subscriptions, round, names, today } = Route.useLoaderData();
  const mayRun = useMay("lifecycle");
  return (
    <>
      <PageHeader
        title="Subscriptions"
        count={subscriptions.length}
        description="Trials first by when they end, then contracts by when their term ends."
      />
      <div className="grid gap-6">
        {mayRun ? <DailyRound round={round} names={names} /> : null}
        <DataTable
          caption="Subscriptions"
          rows={subscriptions}
          columns={columnsFor(today)}
          rowLabel={nameOf}
          card={CARD}
          empty={{
            icon: Repeat,
            title: "No subscriptions yet",
            description:
              "The daily round gives every tenant without one a subscription that keeps what its schools have.",
          }}
        />
      </div>
    </>
  );
}

/**
 * When the daily round last ran and what it did, and running it now. It
 * runs on its own each day; running it here applies what began or ended
 * today at once.
 */
interface DailyRoundProps {
  round: Data["round"];
  names: Data["names"];
}

function DailyRound({ round, names }: DailyRoundProps) {
  const router = useRouter();
  const run = useServerFn(runDailyRound);
  const [running, setRunning] = useState(false);
  return (
    <RecordSection
      title="Daily round"
      description="Each day it gives every tenant without a subscription one that keeps what it has, publishes what began or ended that day, and makes a tenant read only when its trial is over without a contract."
      action={
        <Button
          type="button"
          variant="outline"
          disabled={running}
          onClick={async () => {
            setRunning(true);
            const failed = await attempt(
              () => run(),
              "The round could not run.",
            );
            setRunning(false);
            if (failed) toast.error(failed);
            else {
              toast.success("The round ran.");
              await router.invalidate();
            }
          }}
        >
          <Play aria-hidden />
          {running ? "Running…" : "Run the round now"}
        </Button>
      }
    >
      {round ? (
        <p className="text-sm leading-5">
          Last ran {formatWhen(round.at)} by{" "}
          {names[round.by] ?? "a former operator"}, for{" "}
          {formatDay(round.outcome.day)}: {round.outcome.grandfathered} given a
          subscription, {round.outcome.published} schools published,{" "}
          {round.outcome.paused} trials paused, {round.outcome.leadsDeleted}{" "}
          lost leads deleted
          {round.outcome.failed.length
            ? `, ${round.outcome.failed.length} could not be finished and are logged`
            : ""}
          .
        </p>
      ) : (
        <p className="text-sm leading-5 text-muted-foreground">
          It has not run yet.
        </p>
      )}
    </RecordSection>
  );
}
