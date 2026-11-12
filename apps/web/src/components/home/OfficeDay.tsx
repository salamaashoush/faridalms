import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type { DayCards } from "~/components/home/parts";
import type { OfficeNeed } from "~/components/home/slots";

import { eventTitle } from "~/components/calendar/format";
import { inPlace } from "~/components/home/cards";
import {
  HomeCard,
  HomeItem,
  HomeList,
  itemLink,
} from "~/components/home/parts";
import { SchoolSetup } from "~/components/home/SchoolSetup";
import { officeCards, officeNeeds } from "~/components/home/slots";
import { displayName } from "~/components/people/format";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { adminHomeQuery } from "~/queries/home";
import { formatDate, formatNumber } from "~/utils/datetime";

/**
 * The office's day: the school's setup first while it is under way, then
 * what needs someone to act, how attendance is going, what is coming, how
 * recent announcements were read, and what modules add beside them.
 */
export function useOfficeDay(): DayCards {
  const data = useSuspenseQuery(adminHomeQuery).data;
  const { capabilities } = useCurrentUser();
  const asked = useSlot(officeNeeds).flatMap((part) => {
    const query = part.query(capabilities);
    return query ? [{ part, query }] : [];
  });
  const read = useSuspenseQueries({
    queries: asked.map((row) => row.query),
  });
  const extra = asked
    .map((row, index) => ({
      place: row.part.place ?? 50,
      need: row.part.needOf(read[index]?.data),
    }))
    .toSorted((a, b) => a.place - b.place)
    .flatMap((row) => (row.need ? [row.need] : []));
  const carded = useSlot(officeCards).flatMap((part) => {
    const query = part.query(capabilities);
    return query ? [{ part, query }] : [];
  });
  const cardReads = useSuspenseQueries({
    queries: carded.map((row) => row.query),
  });
  const cards = carded.map((row, index) => ({
    area: row.part.area ?? "side",
    place: row.part.place ?? 0,
    node: row.part.cardOf(cardReads[index]?.data),
  }));
  const needs: OfficeNeed[] = [
    ...extra,
    ...(data.failed
      ? [
          {
            key: "failed",
            label: m.homeFailedNotifications({ count: data.failed }),
            link: {
              to: "/notification-audit",
              search: { state: "failed" },
            },
          },
        ]
      : []),
  ] as OfficeNeed[];
  const footers = needs.flatMap((need) => (need.footer ? [need.footer] : []));
  const own = [
    data.onboarding ? (
      <SchoolSetup key="onboarding" onboarding={data.onboarding} />
    ) : null,
    needs.length > 0 ? (
      <HomeCard key="needs" title={m.homeNeedsAction()}>
        <div className="grid gap-4">
          <HomeList>
            {needs.map((need) => (
              <HomeItem
                key={need.key}
                title={
                  <Link {...need.link} className={itemLink}>
                    {need.label}
                  </Link>
                }
              />
            ))}
          </HomeList>
          {footers}
        </div>
      </HomeCard>
    ) : null,
    data.communications.length > 0 ? (
      <HomeCard key="communications" title={m.homeRecentAnnouncements()}>
        <HomeList>
          {data.communications.map((row) => (
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
              status={
                <span className="text-[13px] text-muted-foreground tabular-nums">
                  {m.homeReadOf({
                    count: formatNumber(row.read),
                    total: formatNumber(row.recipients),
                  })}
                </span>
              }
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
  ];
  const main = inPlace([
    ...own.map((node, index) => ({
      place: [0, 10, 30][index] ?? 30,
      node,
    })),
    ...cards.filter((card) => card.area === "main"),
  ]);
  const aside = [
    ...inPlace(cards.filter((card) => card.area === "side")),
    data.documents.length > 0 ? (
      <HomeCard key="documents" title={m.homeDocumentsExpiring()}>
        <HomeList>
          {data.documents.map((row) => (
            <HomeItem
              key={`${row.studentId}-${row.meaning}`}
              title={
                <Link
                  to="/students/$studentId"
                  params={{ studentId: row.studentId }}
                  search={{ tab: "details" }}
                  className={itemLink}
                >
                  <bdi>{displayName(row)}</bdi>
                </Link>
              }
              facts={[
                inLocale(row.labelEn, row.labelAr),
                m.identityExpires({ date: formatDate(row.expiresOn) }),
              ]}
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
    data.events.length > 0 ? (
      <HomeCard
        key="events"
        title={m.homeNextSevenDays()}
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
  ].filter(Boolean);
  return { today: data.today, main, aside };
}
