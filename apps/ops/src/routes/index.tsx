import type { AttentionItem } from "@faridalms/ui/system/attention-list";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { formatDayIn } from "@faridalms/domain/date-text";
import { AttentionList } from "@faridalms/ui/system/attention-list";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { CellWithNote } from "@faridalms/ui/system/cell-note";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { Metric, MetricGrid } from "@faridalms/ui/system/metrics";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useDesignSystem } from "@faridalms/ui/system/provider";
import { RecordStack } from "@faridalms/ui/system/record-page";
import { createFileRoute } from "@tanstack/react-router";
import { School as SchoolIcon } from "lucide-react";

import type { getHome } from "../server/home";

import { HealthBadge } from "../components/Health";
import { CloseTaskButton } from "../components/TaskList";
import { formatDay, formatMoney, HEALTH_REASON_NAMES } from "../format";
import { useMay } from "../may";
import { getHome as loadHome } from "../server/home";

export const Route = createFileRoute("/")({
  loader: () => loadHome(),
  component: Home,
});

type HomeData = Awaited<ReturnType<typeof getHome>>;
type SchoolRow = HomeData["schools"]["needing"][number];

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en")} ${count === 1 ? one : many}`;

/**
 * The console's first page, for whoever signed in: what is due for them
 * today, the figures of the areas their roles work, each opening its list,
 * and the schools that need help. Work before figures: the day's list leads.
 */
function Home() {
  const data = Route.useLoaderData();
  const mayTenants = useMay("readTenants");
  return (
    <Page width="list">
      <PageHeader
        title="Home"
        description={formatDayIn(data.today, "weekday", "en")}
      />
      <RecordStack>
        <YourDay data={data} />
        <Figures data={data} />
        {mayTenants && data.schools.needing.length ? (
          <SchoolsNeedingHelp rows={data.schools.needing} />
        ) : null}
      </RecordStack>
    </Page>
  );
}

interface HomeProps {
  data: HomeData;
}

/**
 * What is due for the operator today, most urgent first: their calls and
 * tasks, their leads' next steps, and for finance the drafts to issue.
 * Someone else's work is not here; nobody's work is, until someone takes it.
 */
function YourDay({ data }: HomeProps) {
  const { tasks, steps, drafts, today, me, myName } = data;
  const late = (day: string) => day < today;
  const items: AttentionItem[] = [
    ...tasks.map(({ task, customerName }) => ({
      id: `task-${task.id}`,
      tone: late(task.dueOn) ? ("danger" as const) : ("warning" as const),
      title: task.title,
      detail: `${customerName} · ${late(task.dueOn) ? `was due ${formatDay(task.dueOn)}` : "due today"}${task.assigneeId === me ? "" : " · nobody has taken it"}`,
      action: (
        <>
          <ButtonLink
            variant="ghost"
            size="sm"
            to="/customers/$customerId"
            params={{ customerId: task.customerId }}
          >
            Open customer
          </ButtonLink>
          <CloseTaskButton task={task} />
        </>
      ),
    })),
    ...steps.map((lead) => ({
      id: `lead-${lead.id}`,
      tone:
        lead.nextStepOn !== null && late(lead.nextStepOn)
          ? ("danger" as const)
          : ("warning" as const),
      title: `${lead.organisation}: ${lead.nextStep ?? "next step"}`,
      detail: `Lead · ${lead.nextStepOn && late(lead.nextStepOn) ? `was due ${formatDay(lead.nextStepOn)}` : "due today"}${lead.ownerId ? "" : " · nobody owns it"}`,
      action: (
        <ButtonLink
          variant="outline"
          size="sm"
          to="/leads/$leadId"
          params={{ leadId: lead.id }}
        >
          Open lead
        </ButtonLink>
      ),
    })),
    ...(drafts && drafts.count
      ? [
          {
            id: "drafts",
            tone: "info" as const,
            title: `${plural(drafts.count, "draft invoice", "draft invoices")} to check and issue`,
            detail: drafts.oldest
              ? `The daily round drafted them; the oldest is for ${formatDay(drafts.oldest)}.`
              : "The daily round drafted them.",
            action: (
              <ButtonLink
                variant="outline"
                size="sm"
                to="/billing"
                search={{ status: ["draft"] }}
              >
                Open drafts
              </ButtonLink>
            ),
          },
        ]
      : []),
  ];
  return (
    <AttentionList
      title={`Your day${myName ? `, ${myName.split(" ")[0]}` : ""}`}
      items={items}
      empty="Nothing is due for you today."
    />
  );
}

/**
 * The areas the operator's roles work, a figure each, each opening the list
 * behind it: money overdue, drafts to issue, schools needing help, trials
 * ending and leads' next steps due. A figure for an area the operator does
 * not work is not shown.
 */
function Figures({ data }: HomeProps) {
  const { formatNumber } = useDesignSystem();
  const { overdue, drafts, trials, nextSteps, schools } = data;
  const [main, ...others] = overdue ?? [];
  return (
    <MetricGrid label="At a glance">
      {overdue ? (
        <Metric
          label="Overdue"
          value={main ? formatMoney(main.minor, main.currency) : "Nothing"}
          link={{ to: "/receivables" }}
          detail={
            main
              ? {
                  text: [
                    plural(main.customers, "customer", "customers"),
                    ...others.map((total) =>
                      formatMoney(total.minor, total.currency),
                    ),
                  ].join(" · "),
                  tone: "danger",
                }
              : { text: "Every invoice is paid on time" }
          }
        />
      ) : null}
      {drafts ? (
        <Metric
          label="Drafts to issue"
          value={formatNumber(drafts.count)}
          link={{ to: "/billing", search: { status: ["draft"] } }}
          detail={{
            text: drafts.count
              ? "Checked and issued in Billing"
              : "None waiting",
          }}
        />
      ) : null}
      <Metric
        label="Schools needing help"
        value={formatNumber(schools.red + schools.amber)}
        link={{
          to: "/schools",
          search: { health: ["red", "amber"] },
        }}
        detail={
          schools.red + schools.amber
            ? {
                text: `${formatNumber(schools.red)} need help, ${formatNumber(schools.amber)} to watch`,
                tone: schools.red ? "danger" : "warning",
              }
            : {
                text: `All ${formatNumber(schools.served)} are healthy`,
                tone: "success",
              }
        }
      />
      {trials ? (
        <Metric
          label="Trials ending"
          value={formatNumber(trials.count)}
          link={{ to: "/subscriptions", search: { state: ["trial"] } }}
          detail={
            trials.over
              ? {
                  text: `${formatNumber(trials.over)} already over, without a contract`,
                  tone: "danger",
                }
              : { text: "Within the next two weeks" }
          }
        />
      ) : null}
      {nextSteps !== null ? (
        <Metric
          label="Leads' next steps due"
          value={formatNumber(nextSteps)}
          link={{ to: "/leads" }}
          detail={{
            text: nextSteps ? "Today or earlier, for everyone" : "Nothing due",
            tone: nextSteps ? "warning" : undefined,
          }}
        />
      ) : null}
    </MetricGrid>
  );
}

function schoolColumns(): Column<SchoolRow>[] {
  return [
    {
      id: "school",
      header: "School",
      primary: true,
      cell: (school) => (
        <CellWithNote
          note={school.reasons
            .map((reason) => HEALTH_REASON_NAMES[reason])
            .join("; ")}
        >
          <RowLink to="/schools/$schoolId" params={{ schoolId: school.id }}>
            {school.name}
          </RowLink>
        </CellWithNote>
      ),
    },
    {
      id: "health",
      header: "Health",
      cell: (school) => <HealthBadge level={school.level} />,
    },
    {
      id: "onboarding",
      header: "Onboarding",
      align: "end",
      cell: (school) =>
        school.onboarding.done === school.onboarding.total ? (
          <span className="text-muted-foreground">Done</span>
        ) : (
          `${school.onboarding.done} of ${school.onboarding.total}`
        ),
    },
    {
      id: "signedIn",
      header: "Signed in this week",
      align: "end",
      cell: (school) =>
        school.signedIn7d === null ? (
          <span className="text-muted-foreground">Not reported</span>
        ) : (
          school.signedIn7d.toLocaleString("en")
        ),
    },
  ];
}

const SCHOOL_CARD: DataTableCard<SchoolRow> = {
  title: (school) => (
    <RowLink to="/schools/$schoolId" params={{ schoolId: school.id }}>
      {school.name}
    </RowLink>
  ),
  status: (school) => <HealthBadge level={school.level} />,
  fact: (school) =>
    school.reasons.map((reason) => HEALTH_REASON_NAMES[reason]).join("; "),
};

interface SchoolsNeedingHelpProps {
  rows: SchoolRow[];
}

/**
 * Support's queue: every school whose health is not green, those needing
 * help before those to watch, each with why. A stalled onboarding is one
 * of the reasons, so it has no list of its own.
 */
function SchoolsNeedingHelp({ rows }: SchoolsNeedingHelpProps) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base leading-6 font-semibold">
          Schools that need help
        </h2>
        <ButtonLink variant="ghost" size="sm" to="/schools">
          All schools
        </ButtonLink>
      </div>
      <DataTable
        caption="Schools that need help"
        rows={rows}
        columns={schoolColumns()}
        rowLabel={(school) => school.name}
        card={SCHOOL_CARD}
        empty={{ icon: SchoolIcon, title: "Every school is healthy" }}
      />
    </div>
  );
}
