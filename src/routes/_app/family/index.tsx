import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

import type { AttentionItem } from "~/components/family/NeedsAttention";

import { EmptyState, PageHeader } from "~/components/app/primitives";
import { ChildCard } from "~/components/family/ChildCard";
import { NeedsAttention } from "~/components/family/NeedsAttention";
import { UpcomingList } from "~/components/family/UpcomingList";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { familyOverviewQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/family/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(familyOverviewQuery);
  },
  component: FamilyOverviewPage,
});

function FamilyOverviewPage() {
  const user = useCurrentUser();
  const { schoolYear, overviews, unread, upcoming } =
    useSuspenseQuery(familyOverviewQuery).data;

  const attention: AttentionItem[] = overviews
    .filter((row) => row.overdue > 0)
    .map((row) => ({
      id: `overdue-${row.student.id}`,
      text: m.familyAttentionOverdue({
        count: formatNumber(row.overdue),
        name: row.student.firstName,
      }),
    }));

  if (unread > 0) {
    attention.push({
      id: "unread",
      text: m.familyAttentionUnread({ count: formatNumber(unread) }),
    });
  }

  return (
    <>
      <PageHeader
        title={m.overviewGreeting({ name: user.name })}
        description={m.overviewSchoolYear({ year: schoolYear })}
      />

      <div className="flex flex-col gap-6">
        <NeedsAttention items={attention} />

        <section
          aria-labelledby="family-children-heading"
          className="flex flex-col gap-4"
        >
          <h2
            id="family-children-heading"
            className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
          >
            {m.familyYourChildren()}
          </h2>

          {overviews.length === 0 ? (
            <EmptyState title={m.familyNoChildren()} icon={Users} />
          ) : (
            overviews.map((row) => (
              <ChildCard
                key={row.student.id}
                student={row.student}
                attendanceRate={row.attendance.rate}
                average={row.average}
                dueThisWeek={row.dueThisWeek}
                overdue={row.overdue}
                nextDue={row.nextDue}
              />
            ))
          )}
        </section>

        <UpcomingList events={upcoming} />
      </div>
    </>
  );
}
