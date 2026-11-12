import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordColumns } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { House } from "lucide-react";

import { classTitle } from "~/components/classes/format";
import { inPlace, loadCards, useModuleCards } from "~/components/home/cards";
import {
  HomeCard,
  HomeItem,
  HomeList,
  itemLink,
} from "~/components/home/parts";
import { learnerCards, youngTasks } from "~/components/home/slots";
import { YoungHome } from "~/components/home/YoungHome";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { studentHomeQuery } from "~/queries/home";
import { currentUserQuery } from "~/queries/user";
import { formatDate } from "~/utils/datetime";

export const Route = createFileRoute("/_app/me/")({
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(studentHomeQuery),
      loadCards(
        context.queryClient,
        context.extensions,
        user,
        user.profile === "young_student" ? youngTasks : learnerCards,
      ),
    ]);
  },
  component: Home,
});

function Home() {
  return useCurrentUser().profile === "young_student" ? (
    <YoungHome />
  ) : (
    <StudentHome />
  );
}

/**
 * A student's home: what the modules on put first, work due soon and
 * today's lessons, then a lesson to pick up again, announcements for them
 * and their classes.
 */
function StudentHome() {
  const data = useSuspenseQuery(studentHomeQuery).data;
  const added = useModuleCards(learnerCards);
  const own = [
    data.announcements.length > 0 ? (
      <HomeCard
        key="announcements"
        title={m.homeAnnouncements()}
        action={{
          label: m.homeOpenAnnouncements(),
          link: { to: "/announcements", search: {} },
        }}
      >
        <HomeList>
          {data.announcements.map((row) => (
            <HomeItem
              key={row.id}
              title={
                <Link
                  to="/announcements/$announcementId"
                  params={{ announcementId: row.id }}
                  className={itemLink}
                >
                  <bdi>{row.title}</bdi>
                </Link>
              }
              summary={row.summary}
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
    data.classes.length > 0 ? (
      <HomeCard key="classes" title={m.homeClasses()}>
        <HomeList>
          {data.classes.map((row) => (
            <HomeItem
              key={row.id}
              title={
                <bdi className="text-sm leading-5 font-medium">
                  {classTitle(row)}
                </bdi>
              }
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
  ];
  const main = inPlace(added.main);
  const aside = inPlace([
    ...own.map((node, index) => ({ place: (index + 2) * 10, node })),
    ...added.side,
  ]);
  return (
    <Page width="list">
      <PageHeader title={m.navHome()} description={formatDate(data.today)} />
      {main.length + aside.length === 0 ? (
        <EmptyState
          icon={House}
          title={m.homeClearTitle()}
          description={m.homeClearBody()}
        />
      ) : (
        <RecordColumns main={main} aside={aside.length ? aside : undefined} />
      )}
    </Page>
  );
}
