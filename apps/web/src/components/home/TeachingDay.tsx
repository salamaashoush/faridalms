import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type { DayCards } from "~/components/home/parts";

import { eventTitle } from "~/components/calendar/format";
import { classTitle } from "~/components/classes/format";
import { inPlace, useModuleCards } from "~/components/home/cards";
import {
  HomeCard,
  HomeItem,
  HomeList,
  itemLink,
} from "~/components/home/parts";
import { teacherCards } from "~/components/home/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { teacherHomeQuery } from "~/queries/home";
import { formatDate } from "~/utils/datetime";

/**
 * A teacher's day: what the modules on put first, their lessons and what
 * waits for them, then messages, the week and their classes. Each card has
 * one way on and goes when empty.
 */
export function useTeachingDay(): DayCards {
  const data = useSuspenseQuery(teacherHomeQuery).data;
  const added = useModuleCards(teacherCards);
  const aside = [
    data.messages.unread > 0 ? (
      <HomeCard
        key="messages"
        title={m.homeUnreadMessages()}
        description={m.homeUnreadCount({ count: data.messages.unread })}
        action={{
          label: m.homeOpenMessages(),
          link: { to: "/messages", search: {} },
        }}
      >
        <HomeList>
          {data.messages.threads.map((thread) => (
            <HomeItem
              key={thread.id}
              title={
                <Link
                  to="/messages"
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
          link: { to: "/classes", search: {} },
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
  ];
  return {
    today: data.today,
    main: inPlace(added.main),
    aside: inPlace([
      ...aside.map((node, index) => ({ place: (index + 1) * 10, node })),
      ...added.side,
    ]),
  };
}
