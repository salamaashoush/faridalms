import { STALL_DAYS } from "@faridalms/domain/onboarding";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@faridalms/ui/table";
import { createFileRoute, Link } from "@tanstack/react-router";

import { HealthBadge } from "../components/Health";
import { TaskList } from "../components/TaskList";
import { HEALTH_REASON_NAMES } from "../format";
import { useMay } from "../may";
import { getHome } from "../server/home";

export const Route = createFileRoute("/")({
  loader: () => getHome(),
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();
  const mayCustomers = useMay("customers");
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Home</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The schools that need someone, the worst first, the onboardings that
          have stalled, and what is due today. A school is red when nobody
          signed in through a week of school or an invoice is over a month
          overdue, and amber when its onboarding stalls, one of its addresses
          fails or its messages are not delivered.
        </p>
      </div>

      <section aria-label="Needs attention" className="grid gap-3">
        <h2 className="text-base font-semibold">Needs attention</h2>
        {data.attention.length ? (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Why</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.attention.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        to="/schools/$schoolId"
                        params={{ schoolId: row.id }}
                        className="font-medium underline"
                      >
                        {row.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {row.slug}
                      </div>
                    </TableCell>
                    <TableCell>
                      <HealthBadge level={row.level} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.reasons
                        .map((reason) => HEALTH_REASON_NAMES[reason])
                        .join("; ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Every school is healthy.
          </p>
        )}
      </section>

      <section aria-label="Onboarding stalled" className="grid max-w-3xl gap-3">
        <h2 className="text-base font-semibold">Onboarding stalled</h2>
        {data.stalled.length ? (
          <ul className="divide-y rounded-lg border text-sm">
            {data.stalled.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
              >
                <Link
                  to="/schools/$schoolId"
                  params={{ schoolId: row.id }}
                  className="font-medium underline"
                >
                  {row.name}
                </Link>
                <span className="text-muted-foreground tabular-nums">
                  {row.done} of {row.total} steps, none in {STALL_DAYS} days
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No onboarding has stalled.
          </p>
        )}
      </section>

      {mayCustomers ? (
        <section aria-label="Tasks" className="grid max-w-3xl gap-3">
          <h2 className="text-base font-semibold">Tasks</h2>
          <TaskList
            rows={data.tasks}
            names={data.names}
            today={data.today}
            showCustomer
          />
        </section>
      ) : null}
    </div>
  );
}
