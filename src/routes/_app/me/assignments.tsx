import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import * as v from "valibot";

import { EmptyState, PageHeader } from "~/components/app/primitives";
import { AssignmentCard } from "~/components/me/AssignmentCard";
import { WeekNav } from "~/components/me/WeekNav";
import * as m from "~/i18n/messages";
import { assignmentsQuery } from "~/queries/school";
import { assignmentsQuerySchema } from "~/schema/school";

export const Route = createFileRoute("/_app/me/assignments")({
  validateSearch: (search) => v.parse(assignmentsQuerySchema, search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(assignmentsQuery(deps));
  },
  component: MyAssignmentsPage,
});

function MyAssignmentsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { today, week, weeks, rows } = useSuspenseQuery(
    assignmentsQuery(search),
  ).data;

  const position = weeks.findIndex((entry) => entry.number === week.number);
  const previous = position > 0 ? weeks[position - 1] : undefined;
  const next = position >= 0 ? weeks[position + 1] : undefined;

  const goToWeek = (number: number) => {
    void navigate({ search: (prev) => ({ ...prev, week: number }) });
  };

  return (
    <>
      <PageHeader
        title={m.assignmentsTitle()}
        description={m.meAssignmentsSubtitle()}
      />

      <WeekNav
        weekNumber={week.number}
        startsOn={week.startsOn}
        endsOn={week.endsOn}
        hasPrevious={previous !== undefined}
        hasNext={next !== undefined}
        onPrevious={() => {
          if (previous) {
            goToWeek(previous.number);
          }
        }}
        onNext={() => {
          if (next) {
            goToWeek(next.number);
          }
        }}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={m.assignmentsEmpty()}
          body={m.meAllCaughtUp()}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((row) => (
            <AssignmentCard key={row.id} row={row} today={today} />
          ))}
        </div>
      )}
    </>
  );
}
