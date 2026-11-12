import type { ReactNode } from "react";

import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordColumns } from "@faridalms/ui/system/record-page";
import { createFileRoute } from "@tanstack/react-router";
import { Sun } from "lucide-react";
import { isValidElement } from "react";

import type { DayCards } from "~/components/home/parts";

import { useOfficeDay } from "~/components/home/OfficeDay";
import { officeNeeds } from "~/components/home/slots";
import { useTeachingDay } from "~/components/home/TeachingDay";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { loadTeaches, useTeaches } from "~/hooks/useTeaches";
import * as m from "~/i18n/messages";
import { adminHomeQuery, teacherHomeQuery } from "~/queries/home";
import { currentUserQuery } from "~/queries/user";
import { formatDate } from "~/utils/datetime";
import { filled } from "~/utils/extension";

interface Sides {
  teaching: boolean;
  office: boolean;
}

/**
 * Which sides of the day a staff member sees: the teaching day for whoever
 * teaches or takes registers, the office's for administrators. An
 * administrator who teaches nothing is not shown an empty teaching day.
 */
function sidesOf(
  user: { capabilities: readonly string[]; profile: string },
  teaches: boolean,
): Sides {
  const office = user.profile === "staff_admin";
  const teachingWork =
    user.capabilities.includes("assignments:author") ||
    user.capabilities.includes("attendance:record");
  return { teaching: teachingWork && (teaches || !office), office };
}

export const Route = createFileRoute("/_app/_staff/today")({
  loader: async ({ context }) => {
    const { queryClient } = context;
    const [user, teaches] = await Promise.all([
      queryClient.ensureQueryData(currentUserQuery),
      loadTeaches(queryClient),
    ]);
    const sides = sidesOf(user, teaches);
    await Promise.all([
      sides.teaching ? queryClient.ensureQueryData(teacherHomeQuery) : null,
      sides.office ? queryClient.ensureQueryData(adminHomeQuery) : null,
      ...(sides.office
        ? filled(context.extensions, user.modules, officeNeeds).flatMap(
            (need) => {
              const query = need.query(user.capabilities);
              return query ? [queryClient.ensureQueryData(query)] : [];
            },
          )
        : []),
    ]);
  },
  component: TodayPage,
});

function TodayPage() {
  const user = useCurrentUser();
  const sides = sidesOf(user, useTeaches());
  if (sides.teaching && sides.office) return <FullDay />;
  if (sides.office) return <OfficeOnly />;
  if (sides.teaching) return <TeachingOnly />;
  return <Day today={user.today} main={[]} aside={[]} />;
}

function TeachingOnly() {
  return <Day {...useTeachingDay()} />;
}

function OfficeOnly() {
  return <Day {...useOfficeDay()} />;
}

const notEvents = (card: ReactNode) =>
  !(isValidElement(card) && card.key === "events");

/**
 * The teaching day first, then the office's. The office's week of events is
 * the school's, which holds the teacher's own, so it is shown once.
 */
function FullDay() {
  const teaching = useTeachingDay();
  const office = useOfficeDay();
  return (
    <Day
      today={office.today}
      main={[...teaching.main, ...office.main]}
      aside={[...teaching.aside.filter(notEvents), ...office.aside]}
    />
  );
}

/** A staff member's day: what needs them first, what is coming beside it. */
function Day({ today, main, aside }: DayCards) {
  return (
    <Page width="list">
      <PageHeader title={m.navToday()} description={formatDate(today)} />
      {main.length + aside.length === 0 ? (
        <EmptyState
          icon={Sun}
          title={m.homeClearTitle()}
          description={m.homeClearBody()}
        />
      ) : (
        <RecordColumns
          main={main.length ? main : aside}
          aside={main.length && aside.length ? aside : undefined}
        />
      )}
    </Page>
  );
}
