import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Sun } from "lucide-react";

import { eventTitle } from "~/components/calendar/format";
import { classTitle } from "~/components/classes/format";
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
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { teacherHomeQuery } from "~/queries/home";
import { formatInstant, formatDate, formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/teach/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(teacherHomeQuery),
  component: TodayPage,
});

/**
 * A teacher's day: lessons with their registers, then what is waiting for
 * them and what is coming. Each card has one way on and goes when empty.
 */
function TodayPage() {
  const data = useSuspenseQuery(teacherHomeQuery).data;
  const cards = [
    data.slots.length > 0 ? (
      <HomeCard
        key="lessons"
        title={m.homeLessonsToday()}
        action={{
          label: m.homeOpenAttendance(),
          link: { to: "/teach/attendance", search: {} },
        }}
      >
        <Lessons slots={data.slots} registerDate={data.today} />
      </HomeCard>
    ) : null,
    data.review.length > 0 ? (
      <HomeCard
        key="review"
        title={m.homeToReview()}
        description={m.homeToReviewCount({ count: data.reviewTotal })}
        action={{
          label: m.homeOpenToReview(),
          link: { to: "/teach/grading", search: {} },
        }}
      >
        <HomeList>
          {data.review.map((row) => (
            <HomeItem
              key={row.id}
              title={
                <Link
                  to="/assignments/$assignmentId"
                  params={{ assignmentId: row.id }}
                  search={{ tab: "work" }}
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
              ]}
              status={
                <StatusText tone="warning">
                  {m.homeToGradeCount({ count: row.toGrade })}
                </StatusText>
              }
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
    data.due.length > 0 ? (
      <HomeCard
        key="due"
        title={m.homeDueThisWeek()}
        action={{
          label: m.homeOpenCoursework(),
          link: { to: "/teach/assignments", search: {} },
        }}
      >
        <HomeList>
          {data.due.map((row) => (
            <HomeItem
              key={row.id}
              title={
                <Link
                  to="/assignments/$assignmentId"
                  params={{ assignmentId: row.id }}
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
                row.dueAt ? formatInstant(row.dueAt) : null,
              ]}
              status={
                <span className="text-[13px] text-muted-foreground tabular-nums">
                  {m.homeHandedInOf({
                    count: formatNumber(row.handedIn),
                    total: formatNumber(row.recipients),
                  })}
                </span>
              }
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
  ].filter(Boolean);
  const aside = [
    data.messages.unread > 0 ? (
      <HomeCard
        key="messages"
        title={m.homeUnreadMessages()}
        description={m.homeUnreadCount({ count: data.messages.unread })}
        action={{
          label: m.homeOpenMessages(),
          link: { to: "/teach/messages", search: {} },
        }}
      >
        <HomeList>
          {data.messages.threads.map((thread) => (
            <HomeItem
              key={thread.id}
              title={
                <Link
                  to="/teach/messages"
                  search={{ thread: thread.id }}
                  className={itemLink}
                >
                  <bdi>
                    {inLocale(
                      thread.lastAuthorNameEn,
                      thread.lastAuthorNameAr,
                    ) || thread.subject}
                  </bdi>
                </Link>
              }
              summary={thread.lastBody ?? undefined}
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
    data.events.length > 0 ? (
      <HomeCard
        key="events"
        title={m.homeThisWeek()}
        action={{
          label: m.homeOpenCalendar(),
          link: { to: "/calendar", search: {} },
        }}
      >
        <HomeList>
          {data.events.map((event) => (
            <HomeItem
              key={event.id}
              title={
                <Link
                  to="/calendar/$eventId"
                  params={{ eventId: event.id }}
                  className={itemLink}
                >
                  <bdi>{eventTitle(event)}</bdi>
                </Link>
              }
              facts={[formatDate(event.startsOn), event.location]}
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
    data.classes.length > 0 ? (
      <HomeCard
        key="classes"
        title={m.homeClasses()}
        action={{
          label: m.homeOpenClasses(),
          link: { to: "/teach/classes", search: {} },
        }}
      >
        <HomeList>
          {data.classes.map((row) => (
            <HomeItem
              key={row.id}
              title={
                <Link
                  to="/classes/$classId"
                  params={{ classId: row.id }}
                  className={itemLink}
                >
                  <bdi>{classTitle(row)}</bdi>
                </Link>
              }
              facts={[m.homeStudentCount({ count: row.students })]}
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
  ].filter(Boolean);
  return (
    <>
      <PageHeader title={m.navToday()} description={formatDate(data.today)} />
      {cards.length + aside.length === 0 ? (
        <EmptyState
          icon={Sun}
          title={m.homeClearTitle()}
          description={m.homeClearBody()}
        />
      ) : (
        <RecordColumns main={cards} aside={aside.length ? aside : undefined} />
      )}
    </>
  );
}
