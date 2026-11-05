import { Badge } from "@faridalms/ui/badge";
import { Button } from "@faridalms/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@faridalms/ui/table";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import { formatDay, formatWhen } from "../format";
import { useMay } from "../may";
import { getSubscriptions, runDailyRound } from "../server/subscriptions";

export const Route = createFileRoute("/subscriptions/")({
  loader: () => getSubscriptions(),
  component: Subscriptions,
});

type Data = Awaited<ReturnType<typeof getSubscriptions>>;

function Subscriptions() {
  const { subscriptions, round, names, today } = Route.useLoaderData();
  const mayRun = useMay("lifecycle");
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">
          What each tenant holds now: trials first by when they end, then
          contracts by when their term ends. A subscription sets what its
          schools may use.
        </p>
      </div>
      {mayRun ? <DailyRound round={round} names={names} /> : null}
      {subscriptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No subscriptions yet. The daily round gives every tenant without one a
          subscription that keeps what its schools have.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Holds</TableHead>
                <TableHead>Ends</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((subscription) => {
                const ends =
                  subscription.trialEndsOn ?? subscription.termEndsOn;
                return (
                  <TableRow key={subscription.id}>
                    <TableCell>
                      <Link
                        to="/subscriptions/$subscriptionId"
                        params={{ subscriptionId: subscription.id }}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {subscription.tenantName ?? subscription.customerName}
                      </Link>
                    </TableCell>
                    <TableCell>{subscription.customerName}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {subscription.state === "trial" ? "Trial" : "Active"}
                        </Badge>
                        {subscription.grandfathered ? (
                          <Badge variant="outline">Grandfathered</Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ends
                        ? `${formatDay(ends)}${subscription.state === "trial" && ends < today ? ", trial over" : ""}`
                        : "No end"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/**
 * When the daily round last ran and what it did, and running it now. It
 * runs on its own each day; running it here applies what began or ended
 * today at once.
 */
function DailyRound({
  round,
  names,
}: {
  round: Data["round"];
  names: Data["names"];
}) {
  const router = useRouter();
  const run = useServerFn(runDailyRound);
  const [running, setRunning] = useState(false);
  return (
    <section
      aria-label="Daily round"
      className="grid max-w-2xl gap-3 rounded-lg border p-6"
    >
      <h2 className="text-base font-semibold">Daily round</h2>
      <p className="text-sm text-muted-foreground">
        Each day the console gives every tenant without a subscription one that
        keeps what it has, publishes what began or ended that day, and makes a
        tenant read only when its trial is over without a contract.
      </p>
      {round ? (
        <p className="text-sm">
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
        <p className="text-sm">It has not run yet.</p>
      )}
      <Button
        className="justify-self-start"
        disabled={running}
        onClick={async () => {
          setRunning(true);
          try {
            const out = await run();
            if (out.ok) {
              toast.success("The round ran.");
              await router.invalidate();
            } else toast.error(out.message);
          } catch (error) {
            const said = failure(error, "The round could not run.");
            if (said) toast.error(said);
          } finally {
            setRunning(false);
          }
        }}
      >
        {running ? "Running…" : "Run the round now"}
      </Button>
    </section>
  );
}
