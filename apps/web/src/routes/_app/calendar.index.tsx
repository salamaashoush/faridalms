import type { IsoWeekday } from "@faridalms/domain/timetable";
import type { Workspace } from "@faridalms/domain/workspace";

import { monthWeeks } from "@faridalms/domain/calendar";
import { addDays, shiftMonth } from "@faridalms/domain/school";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import * as v from "valibot";

import { ButtonLink } from "~/components/app/ButtonLink";
import { Agenda, MonthGrid } from "~/components/calendar/views";
import { PageHeader } from "~/components/system/IndexPage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { calendarRangeQuery } from "~/queries/calendar";
import { currentUserQuery } from "~/queries/user";
import { formatMonthLabel } from "~/utils/datetime";

const VIEWS = ["month", "agenda"] as const;
type View = (typeof VIEWS)[number];

const searchSchema = v.object({
  month: v.fallback(
    v.optional(
      v.union([
        v.literal(""),
        v.pipe(v.string(), v.regex(/^\d{4}-(0[1-9]|1[0-2])$/)),
      ]),
      "",
    ),
    "",
  ),
  view: v.fallback(v.optional(v.picklist(VIEWS)), undefined),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

/** Staff plan from the month; families and students read what is coming. */
const defaultView = (workspace: Workspace): View =>
  workspace === "admin" || workspace === "teach" ? "month" : "agenda";

function windowOf(input: {
  view: View;
  month: string;
  today: string;
  weekStart: IsoWeekday;
}) {
  const last = addDays(`${shiftMonth(input.month, 1)}-01`, -1);
  const first = `${input.month}-01`;
  const agendaFrom = input.today.startsWith(input.month) ? input.today : first;
  if (input.view === "agenda")
    return { from: agendaFrom, to: last, agendaFrom };
  const weeks = monthWeeks(input.month, input.weekStart);
  return {
    from: weeks[0]?.[0] ?? first,
    to: weeks.at(-1)?.[6] ?? last,
    agendaFrom,
  };
}

export const Route = createFileRoute("/_app/calendar/")({
  staticData: { breadcrumb: m.calTitle },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    const window = windowOf({
      view: deps.view ?? defaultView(user.workspace),
      month: deps.month || user.today.slice(0, 7),
      today: user.today,
      weekStart: user.school.weekStart as IsoWeekday,
    });
    await context.queryClient.ensureQueryData(
      calendarRangeQuery({ from: window.from, to: window.to }),
    );
  },
  component: CalendarPage,
});

function CalendarPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const view = search.view ?? defaultView(user.workspace);
  const month = search.month || user.today.slice(0, 7);
  const weekStart = user.school.weekStart as IsoWeekday;
  const window = windowOf({ view, month, today: user.today, weekStart });
  const { events, days, canManage } = useSuspenseQuery(
    calendarRangeQuery({ from: window.from, to: window.to }),
  ).data;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const agenda = (className?: string) => (
    <Agenda
      from={window.agendaFrom}
      to={last}
      today={user.today}
      events={events}
      days={days}
      className={className}
    />
  );
  return (
    <>
      <PageHeader
        title={m.calTitle()}
        description={m.calHint()}
        action={
          canManage
            ? {
                label: m.calNew(),
                icon: Plus,
                link: { to: "/admin/event-editor", search: {} },
              }
            : undefined
        }
      />
      <Tabs
        value={view}
        onValueChange={(next: View) =>
          void navigate({ search: (previous) => ({ ...previous, view: next }) })
        }
        className="grid gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <ButtonLink
              to="/calendar"
              search={(previous) => ({
                ...previous,
                month: shiftMonth(month, -1),
              })}
              variant="outline"
              size="icon"
              className="max-md:size-10"
              aria-label={m.calPrevious()}
            >
              <ChevronLeft className="rtl:rotate-180" aria-hidden />
            </ButtonLink>
            <ButtonLink
              to="/calendar"
              search={(previous) => ({
                ...previous,
                month: shiftMonth(month, 1),
              })}
              variant="outline"
              size="icon"
              className="max-md:size-10"
              aria-label={m.calNext()}
            >
              <ChevronRight className="rtl:rotate-180" aria-hidden />
            </ButtonLink>
            <h2
              className="ms-2 text-lg leading-7 font-semibold"
              aria-live="polite"
            >
              {formatMonthLabel(month)}
            </h2>
            {month === user.today.slice(0, 7) ? null : (
              <ButtonLink
                to="/calendar"
                search={(previous) => ({ ...previous, month: "" })}
                variant="ghost"
                className="ms-1 max-md:h-10"
              >
                {m.calToday()}
              </ButtonLink>
            )}
          </div>
          <TabsList aria-label={m.calView()}>
            <TabsTrigger value="month">{m.calViewMonth()}</TabsTrigger>
            <TabsTrigger value="agenda">{m.calViewAgenda()}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="month">
          <div className="max-md:hidden">
            <MonthGrid
              month={month}
              weekStart={weekStart}
              weekend={user.school.weekendDays}
              today={user.today}
              events={events}
              days={days}
            />
          </div>
          {agenda("md:hidden")}
        </TabsContent>
        <TabsContent value="agenda">{agenda()}</TabsContent>
      </Tabs>
    </>
  );
}
