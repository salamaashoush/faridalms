import { STALL_DAYS } from "@faridalms/domain/onboarding";
import { Progress } from "@faridalms/ui/progress";
import { Metric, MetricGrid } from "@faridalms/ui/system/metrics";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useDesignSystem } from "@faridalms/ui/system/provider";
import {
  RecordColumns,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { createFileRoute, Link } from "@tanstack/react-router";

import type { getHome } from "../server/home";

import { HealthBadge } from "../components/Health";
import { TaskList } from "../components/TaskList";
import { formatMoney, HEALTH_REASON_NAMES } from "../format";
import { useMay } from "../may";
import { getHome as loadHome } from "../server/home";

export const Route = createFileRoute("/")({
  loader: () => loadHome(),
  component: Home,
});

type HomeData = Awaited<ReturnType<typeof getHome>>;
type AttentionRow = HomeData["attention"][number];

interface AttentionProps {
  rows: AttentionRow[];
}

/** Schools that need someone, the worst first, each with why. */
function Attention({ rows }: AttentionProps) {
  if (rows.length === 0)
    return <RecordEmpty>Every school is healthy.</RecordEmpty>;
  return (
    <RecordList>
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
        >
          <div className="grid min-w-0 flex-1 gap-0.5">
            <Link
              to="/schools/$schoolId"
              params={{ schoolId: row.id }}
              className="truncate text-sm leading-5 font-medium hover:text-primary hover:underline"
            >
              {row.name}
            </Link>
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {row.reasons
                .map((reason) => HEALTH_REASON_NAMES[reason])
                .join("; ")}
            </span>
          </div>
          <HealthBadge level={row.level} />
        </li>
      ))}
    </RecordList>
  );
}

interface SummaryProps {
  data: HomeData;
}

/** How the platform stands at a glance, each figure opening its list. */
function Summary({ data }: SummaryProps) {
  const { formatNumber: count } = useDesignSystem();
  const { summary } = data;
  const attention = summary.red + summary.amber;
  const openTasks = data.tasks.length;
  const dueTasks = data.tasks.filter(
    (row) => row.task.dueOn <= data.today,
  ).length;
  return (
    <MetricGrid label="Summary">
      <Metric
        label="Schools"
        value={count(summary.served)}
        detail={{ text: `${count(summary.healthy)} healthy` }}
        link={{ to: "/schools" }}
      />
      <Metric
        label="Need attention"
        value={count(attention)}
        detail={
          attention
            ? {
                text: `${count(summary.red)} need help · ${count(summary.amber)} to watch`,
                tone: summary.red ? "danger" : "warning",
              }
            : { text: "Every school is healthy", tone: "success" }
        }
      />
      <Metric
        label="Onboarding"
        value={count(summary.onboarding)}
        detail={
          summary.stalled
            ? { text: `${count(summary.stalled)} stalled`, tone: "warning" }
            : { text: "None stalled" }
        }
      />
      {data.leads ? (
        <Metric
          label="Open leads"
          value={count(data.leads.open)}
          detail={
            data.leads.stepsDue
              ? {
                  text: `${count(data.leads.stepsDue)} next steps due`,
                  tone: "warning",
                }
              : { text: "No next step due" }
          }
          link={{ to: "/leads" }}
        />
      ) : null}
      {data.overdue ? (
        <Metric
          label="Overdue"
          value={
            data.overdue.length
              ? data.overdue
                  .map((total) => formatMoney(total.minor, total.currency))
                  .join(" · ")
              : "Nothing"
          }
          detail={
            data.overdue.length
              ? {
                  text: `${count(
                    data.overdue.reduce(
                      (sum, total) => sum + total.customers,
                      0,
                    ),
                  )} customers owe past their due day`,
                  tone: "danger",
                }
              : { text: "Every invoice is paid on time" }
          }
          link={{ to: "/receivables" }}
        />
      ) : null}
      {data.overdue === null && data.leads === null ? (
        <Metric
          label="Open tasks"
          value={count(openTasks)}
          detail={
            dueTasks
              ? { text: `${count(dueTasks)} due now`, tone: "warning" }
              : { text: "None due" }
          }
        />
      ) : null}
    </MetricGrid>
  );
}

interface StalledProps {
  rows: HomeData["stalled"];
}

function Stalled({ rows }: StalledProps) {
  if (rows.length === 0)
    return <RecordEmpty>No onboarding has stalled.</RecordEmpty>;
  return (
    <RecordList>
      {rows.map((row) => (
        <li key={row.id} className="grid gap-2 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <Link
              to="/schools/$schoolId"
              params={{ schoolId: row.id }}
              className="truncate text-sm leading-5 font-medium hover:text-primary hover:underline"
            >
              {row.name}
            </Link>
            <span className="shrink-0 text-[13px] leading-[18px] text-muted-foreground tabular-nums">
              {row.done} of {row.total}
            </span>
          </div>
          <Progress
            value={row.total ? (row.done / row.total) * 100 : 0}
            aria-label={`${row.name}: ${row.done} of ${row.total} steps, none in ${STALL_DAYS} days`}
          />
        </li>
      ))}
    </RecordList>
  );
}

function Home() {
  const data = Route.useLoaderData();
  const mayCustomers = useMay("customers");
  return (
    <>
      <PageHeader
        title="Home"
        description="How the schools are doing and what needs someone today."
      />
      <div className="grid gap-6">
        <Summary data={data} />
        <RecordColumns
          main={
            <RecordSection
              title="Needs attention"
              description="Red when nobody signed in through a week of school or an invoice is a month overdue; amber when onboarding stalls, an address fails or messages are not delivered."
            >
              <Attention rows={data.attention} />
            </RecordSection>
          }
          aside={
            <>
              <RecordSection
                title="Onboarding stalled"
                description={`No new step in ${STALL_DAYS} days.`}
              >
                <Stalled rows={data.stalled} />
              </RecordSection>
              {mayCustomers ? (
                <RecordSection
                  title="Tasks"
                  description="Open, soonest due first."
                >
                  <TaskList
                    rows={data.tasks}
                    names={data.names}
                    today={data.today}
                    showCustomer
                  />
                </RecordSection>
              ) : null}
            </>
          }
        />
      </div>
    </>
  );
}
