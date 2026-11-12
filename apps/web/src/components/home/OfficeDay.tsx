import { Button } from "@faridalms/ui/button";
import { Fact, Facts } from "@faridalms/ui/system/record-page";
import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

import type { DayCards } from "~/components/home/parts";
import type { OfficeNeed } from "~/components/home/slots";

import { eventTitle } from "~/components/calendar/format";
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
import { remindTeachers } from "~/server/attendance";
import { formatDate, formatNumber, formatPercent } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Need = OfficeNeed;

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
  const extra = asked.map((row, index) => row.part.needOf(read[index]?.data));
  const carded = useSlot(officeCards).flatMap((part) => {
    const query = part.query(capabilities);
    return query ? [{ part, query }] : [];
  });
  const cardReads = useSuspenseQueries({
    queries: carded.map((row) => row.query),
  });
  const cards = carded.map((row, index) =>
    row.part.cardOf(cardReads[index]?.data),
  );
  const queryClient = useQueryClient();
  const remind = useMutation({
    mutationFn: () =>
      remindTeachers({
        data: {
          date: data.today,
          classIds: data.registers?.classes.map((row) => row.classId) ?? [],
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["home"] });
      toast.success(m.homeReminded());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const needs: Need[] = [
    ...(data.registers?.notTaken
      ? [
          {
            key: "registers",
            label: m.homeRegistersNotTaken({ count: data.registers.notTaken }),
            link: { to: "/attendance", search: {} },
          },
        ]
      : []),
    ...(data.absences
      ? [
          {
            key: "absences",
            label: m.homeUnexplainedAbsences({ count: data.absences }),
            link: { to: "/attendance", search: { tab: "absences" } },
          },
        ]
      : []),
    ...(data.guardians
      ? [
          {
            key: "guardians",
            label: m.homeWithoutGuardian({ count: data.guardians }),
            link: { to: "/students", search: { missing: ["guardian"] } },
          },
        ]
      : []),
    ...extra.filter((need) => need !== null),
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
  ] as Need[];
  const main = [
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
          {data.registers?.notTaken ? (
            <div>
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                disabled={remind.isPending}
                onClick={() => remind.mutate()}
              >
                <BellRing aria-hidden />
                {m.homeRemindAll()}
              </Button>
            </div>
          ) : null}
        </div>
      </HomeCard>
    ) : null,
    data.attendance ? (
      <HomeCard
        key="attendance"
        title={m.homeAttendance()}
        action={{
          label: m.homeOpenAttendance(),
          link: { to: "/attendance", search: { tab: "reports" } },
        }}
      >
        <Facts short>
          <Fact
            label={m.homeAttendanceToday()}
            notApplicable={data.attendance.today === null}
          >
            {data.attendance.today === null
              ? null
              : formatPercent(data.attendance.today)}
          </Fact>
          <Fact
            label={m.homeAttendanceWeek()}
            notApplicable={data.attendance.week === null}
          >
            {data.attendance.week === null
              ? null
              : formatPercent(data.attendance.week)}
          </Fact>
        </Facts>
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
  ].filter(Boolean);
  const aside = [
    ...cards,
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
