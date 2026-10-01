import { Progress } from "@faridalms/ui/progress";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { House, Play } from "lucide-react";

import { classTitle } from "~/components/classes/format";
import {
  formatInstant,
  STATE_LABEL,
  STATE_TONE,
} from "~/components/coursework/format";
import {
  HomeCard,
  HomeItem,
  HomeList,
  itemLink,
  Lessons,
} from "~/components/home/parts";
import { EmptyState, PageHeader } from "~/components/system/IndexPage";
import { RecordColumns } from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { studentHomeQuery } from "~/queries/home";
import { formatDate, formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/me/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(studentHomeQuery),
  component: StudentHome,
});

/**
 * A student's home: work due soon with anything missing first, today's
 * lessons, a lesson to pick up again, and news from their classes.
 */
function StudentHome() {
  const user = useCurrentUser();
  const data = useSuspenseQuery(studentHomeQuery).data;
  const main = [
    data.due.length > 0 ? (
      <HomeCard
        key="due"
        title={m.homeDueSoon()}
        action={{
          label: m.homeOpenToDo(),
          link: { to: "/me/assignments", search: {} },
        }}
      >
        <HomeList>
          {data.due.map((row) => (
            <HomeItem
              key={row.assignmentId}
              title={
                <Link
                  to="/assignments/$assignmentId"
                  params={{ assignmentId: row.assignmentId }}
                  search={{}}
                  className={itemLink}
                >
                  <bdi>{row.title}</bdi>
                </Link>
              }
              facts={[
                classTitle({
                  code: row.classCode,
                  titleEn: row.classTitleEn,
                  titleAr: row.classTitleAr,
                }),
                row.dueAt
                  ? formatInstant(row.dueAt, user.school.timeZone)
                  : null,
              ]}
              status={
                <StatusText tone={STATE_TONE[row.state]}>
                  {STATE_LABEL[row.state]()}
                </StatusText>
              }
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
    data.slots.length > 0 ? (
      <HomeCard
        key="lessons"
        title={m.homeLessonsToday()}
        action={{
          label: m.homeOpenTimetable(),
          link: { to: "/me/timetable", search: {} },
        }}
      >
        <Lessons slots={data.slots} showTeacher />
      </HomeCard>
    ) : null,
  ].filter(Boolean);
  const aside = [
    data.module ? (
      <HomeCard key="module" title={m.homeContinue()}>
        <div className="grid gap-3">
          <Link
            to="/modules/$moduleId"
            params={{ moduleId: data.module.id }}
            search={{}}
            className={itemLink}
          >
            <span className="inline-flex items-center gap-2">
              <Play aria-hidden className="size-4" />
              <bdi>{data.module.title}</bdi>
            </span>
          </Link>
          <Progress
            value={(data.module.completed / data.module.lessons) * 100}
            aria-label={m.lrnProgressOf({ title: data.module.title })}
            className="gap-1"
          >
            <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
              {m.lrnDoneOf({
                count: formatNumber(data.module.completed),
                total: formatNumber(data.module.lessons),
              })}
            </span>
          </Progress>
        </div>
      </HomeCard>
    ) : null,
    data.announcements.length > 0 ? (
      <HomeCard
        key="news"
        title={m.homeClassNews()}
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
              facts={[row.summary.slice(0, 100)]}
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
  ].filter(Boolean);
  return (
    <>
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
    </>
  );
}
