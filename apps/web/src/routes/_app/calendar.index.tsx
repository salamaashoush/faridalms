import type { CalendarCategory } from "@faridalms/domain/calendar";
import type { IsoWeekday } from "@faridalms/domain/timetable";
import type { Workspace } from "@faridalms/domain/workspace";

import {
  CALENDAR_CATEGORIES,
  monthWeeks,
  weekOf,
} from "@faridalms/domain/calendar";
import { addDays, shiftMonth } from "@faridalms/domain/school";
import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import * as v from "valibot";

import { ButtonLink } from "~/components/app/ButtonLink";
import { EventSheet } from "~/components/calendar/EventSheet";
import { CATEGORY_LABEL } from "~/components/calendar/format";
import { KindFilter } from "~/components/calendar/KindFilter";
import { useReschedule } from "~/components/calendar/Reschedule";
import { Subscribe } from "~/components/calendar/Subscribe";
import {
  Agenda,
  CategoryIcon,
  MonthCompact,
  MonthGrid,
  MoveHint,
  WeekGrid,
} from "~/components/calendar/views";
import { PageHeader } from "~/components/system/IndexPage";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { calendarEventQuery, calendarRangeQuery } from "~/queries/calendar";
import { currentUserQuery } from "~/queries/user";
import { formatDayRange, formatMonthLabel } from "~/utils/datetime";

const VIEWS = ["month", "week", "agenda"] as const;
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
  /** The day jumped to: the week view shows its week, the agenda starts from it. */
  day: v.fallback(
    v.optional(v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]), ""),
    "",
  ),
  /** Kinds of event switched off in the legend. */
  hide: v.fallback(
    v.optional(v.array(v.picklist(CALENDAR_CATEGORIES)), []),
    [],
  ),
  child: v.fallback(
    v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
    "",
  ),
  /** The event open in the side panel, so its address can be shared. */
  event: v.fallback(
    v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
    "",
  ),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

/** Staff plan from the month; families and students read what is coming. */
const defaultView = (workspace: Workspace): View =>
  workspace === "admin" || workspace === "teach" ? "month" : "agenda";

/** The day the calendar is at: the one jumped to, else today in its month or the month's first. */
const anchorOf = (input: { day: string; month: string; today: string }) =>
  input.day && input.day.startsWith(input.month)
    ? input.day
    : input.today.startsWith(input.month)
      ? input.today
      : `${input.month}-01`;

function windowOf(input: {
  view: View;
  month: string;
  day: string;
  today: string;
  weekStart: IsoWeekday;
}) {
  const last = addDays(`${shiftMonth(input.month, 1)}-01`, -1);
  const first = `${input.month}-01`;
  const anchor = anchorOf(input);
  if (input.view === "agenda") return { from: anchor, to: last, anchor };
  if (input.view === "week") {
    const week = weekOf(anchor, input.weekStart);
    return { from: week[0] ?? anchor, to: week[6] ?? anchor, anchor };
  }
  const weeks = monthWeeks(input.month, input.weekStart);
  return {
    from: weeks[0]?.[0] ?? first,
    to: weeks.at(-1)?.[6] ?? last,
    anchor,
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
      day: deps.day,
      today: user.today,
      weekStart: user.school.weekStart as IsoWeekday,
    });
    await Promise.all([
      context.queryClient.ensureQueryData(
        calendarRangeQuery({
          from: window.from,
          to: window.to,
          child: deps.child,
        }),
      ),
      deps.event
        ? context.queryClient.prefetchQuery(calendarEventQuery(deps.event))
        : null,
    ]);
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
  const window = windowOf({
    view,
    month,
    day: search.day,
    today: user.today,
    weekStart,
  });
  const {
    events: all,
    days,
    canAuthor,
    canManage,
    children,
  } = useSuspenseQuery(
    calendarRangeQuery({
      from: window.from,
      to: window.to,
      child: search.child,
    }),
  ).data;
  const hidden = new Set(search.hide);
  const events = all.filter((event) => !hidden.has(event.category));
  const toggle = (category: CalendarCategory) =>
    void navigate({
      search: (previous) => ({
        ...previous,
        hide: hidden.has(category)
          ? search.hide.filter((one) => one !== category)
          : [...search.hide, category],
      }),
    });
  const showAll = () =>
    void navigate({ search: (previous) => ({ ...previous, hide: [] }) });
  const thisMonth = user.today.slice(0, 7);
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const { reschedule, dialog } = useReschedule();
  const actions = {
    canAdd: canAuthor,
    movable: (event: (typeof all)[number]) =>
      canManage || (canAuthor && event.authorUserId === user.id),
    reschedule: (
      event: (typeof all)[number],
      change: { move?: number; extend?: number },
    ) => void reschedule(event, change),
  };
  const moving = canAuthor && events.some(actions.movable);
  const week = view === "week";
  const step = (direction: -1 | 1) =>
    week
      ? (() => {
          const day = addDays(window.from, direction * 7);
          return { month: day.slice(0, 7), day };
        })()
      : { month: shiftMonth(month, direction), day: "" };
  const atToday = week
    ? window.from <= user.today && user.today <= window.to
    : month === thisMonth;
  const jump = (day: string) =>
    void navigate({
      search: (previous) => ({
        ...previous,
        month: day.slice(0, 7) === thisMonth ? "" : day.slice(0, 7),
        day,
      }),
    });
  return (
    <>
      <PageHeader
        title={m.calTitle()}
        description={m.calHint()}
        action={
          canAuthor
            ? {
                label: m.calNew(),
                icon: Plus,
                link: { to: "/event-editor", search: {} },
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
          <div className="flex flex-wrap items-center gap-1 max-md:w-full">
            <ButtonLink
              to="/calendar"
              search={(previous) => ({ ...previous, ...step(-1) })}
              variant="outline"
              size="icon"
              className="max-md:size-10"
              aria-label={week ? m.calPreviousWeek() : m.calPrevious()}
            >
              <ChevronLeft className="rtl:rotate-180" aria-hidden />
            </ButtonLink>
            <h2
              className="min-w-44 text-center text-lg leading-7 font-semibold max-md:flex-1"
              aria-live="polite"
            >
              {week
                ? formatDayRange(window.from, window.to)
                : formatMonthLabel(month)}
            </h2>
            <ButtonLink
              to="/calendar"
              search={(previous) => ({ ...previous, ...step(1) })}
              variant="outline"
              size="icon"
              className="max-md:size-10"
              aria-label={week ? m.calNextWeek() : m.calNext()}
            >
              <ChevronRight className="rtl:rotate-180" aria-hidden />
            </ButtonLink>
            {atToday ? null : (
              <ButtonLink
                to="/calendar"
                search={(previous) => ({ ...previous, month: "", day: "" })}
                variant="ghost"
                className="ms-1 max-md:hidden"
              >
                {m.calToday()}
              </ButtonLink>
            )}
            <label htmlFor="calendar-jump" className="sr-only">
              {m.calJumpToDate()}
            </label>
            <Input
              id="calendar-jump"
              type="date"
              className="ms-1 w-40 max-md:ms-0 max-md:h-10 max-md:w-full"
              value={window.anchor}
              onChange={(event) => {
                if (event.target.value) jump(event.target.value);
              }}
            />
          </div>
          <div className="flex items-center gap-2 max-md:w-full">
            <TabsList aria-label={m.calView()}>
              <TabsTrigger value="month">{m.calViewMonth()}</TabsTrigger>
              <TabsTrigger value="week">{m.calViewWeek()}</TabsTrigger>
              <TabsTrigger value="agenda">{m.calViewAgenda()}</TabsTrigger>
            </TabsList>
            {atToday ? null : (
              <ButtonLink
                to="/calendar"
                search={(previous) => ({ ...previous, month: "", day: "" })}
                variant="ghost"
                className="h-10 md:hidden"
              >
                {m.calToday()}
              </ButtonLink>
            )}
            <div className="flex items-center gap-2 max-md:ms-auto">
              <div className="md:hidden">
                <KindFilter
                  hidden={hidden}
                  onToggle={toggle}
                  onShowAll={showAll}
                />
              </div>
              <Subscribe />
            </div>
          </div>
        </div>
        {children.length > 1 ? (
          <nav aria-label={m.calChildren()} className="flex flex-wrap gap-2">
            {[{ id: "", nameEn: null, nameAr: null }, ...children].map(
              (child) => (
                <ButtonLink
                  key={child.id || "all"}
                  to="/calendar"
                  search={(previous) => ({ ...previous, child: child.id })}
                  variant="outline"
                  aria-current={search.child === child.id ? "page" : undefined}
                  className="h-9 rounded-full aria-[current=page]:border-primary aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary max-md:h-10"
                >
                  {child.id
                    ? inLocale(child.nameEn, child.nameAr)
                    : m.calAllChildren()}
                </ButtonLink>
              ),
            )}
          </nav>
        ) : null}
        <fieldset className="flex flex-wrap items-center gap-1.5 max-md:hidden">
          <legend className="sr-only">{m.calLegend()}</legend>
          {CALENDAR_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={!hidden.has(category)}
              onClick={() => toggle(category)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted aria-pressed:border-border aria-pressed:bg-card aria-pressed:text-foreground [&:not([aria-pressed=true])]:border-dashed [&:not([aria-pressed=true])]:line-through"
            >
              <CategoryIcon
                category={category}
                className={cn(
                  "size-3.5",
                  hidden.has(category) && "text-muted-foreground",
                )}
              />
              {CATEGORY_LABEL[category]()}
            </button>
          ))}
          {search.hide.length > 0 ? (
            <button
              type="button"
              onClick={showAll}
              className="ms-1 h-8 rounded-md px-2 text-[13px] font-medium text-primary hover:bg-muted"
            >
              {m.calShowAll()}
            </button>
          ) : null}
        </fieldset>
        <TabsContent value="month" className="grid gap-2">
          <div className="max-md:hidden">
            <MonthGrid
              month={month}
              weekStart={weekStart}
              weekend={user.school.weekendDays}
              today={user.today}
              events={events}
              days={days}
              actions={actions}
            />
          </div>
          {moving ? <MoveHint /> : null}
          <div className="md:hidden">
            <MonthCompact
              month={month}
              weekStart={weekStart}
              weekend={user.school.weekendDays}
              today={user.today}
              events={events}
              days={days}
            />
          </div>
        </TabsContent>
        <TabsContent value="week" className="grid gap-2">
          <div className="max-md:hidden">
            <WeekGrid
              day={window.anchor}
              weekStart={weekStart}
              weekend={user.school.weekendDays}
              today={user.today}
              events={events}
              days={days}
              actions={actions}
            />
          </div>
          {moving ? <MoveHint /> : null}
          <Agenda
            from={window.from}
            to={window.to}
            today={user.today}
            events={events}
            days={days}
            className="md:hidden"
            everyDay
            canAdd={actions.canAdd}
          />
        </TabsContent>
        <TabsContent value="agenda">
          <Agenda
            from={window.anchor}
            to={last}
            today={user.today}
            events={events}
            days={days}
          />
        </TabsContent>
      </Tabs>
      {dialog}
      <EventSheet
        eventId={search.event || null}
        onClose={() =>
          void navigate({
            search: (previous) => ({ ...previous, event: "" }),
          })
        }
      />
    </>
  );
}
