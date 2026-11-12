import type { ShownCategory } from "@faridalms/domain/calendar";
import type { IsoWeekday } from "@faridalms/domain/school-days";
import type { Workspace } from "@faridalms/domain/workspace";

import {
  CALENDAR_CATEGORIES,
  SHOWN_CATEGORIES,
  monthWeeks,
  weekOf,
} from "@faridalms/domain/calendar";
import { addDays, shiftMonth } from "@faridalms/domain/school";
import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { Segmented, ToolbarRow } from "@faridalms/ui/system/panel";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import * as v from "valibot";

import { EventSheet } from "~/components/calendar/EventSheet";
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
import { useCalendarWords } from "~/components/calendar/words";
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
  hide: v.fallback(v.optional(v.array(v.picklist(SHOWN_CATEGORIES)), []), []),
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
  workspace === "staff" ? "month" : "agenda";

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
  const words = useCalendarWords();
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
    categories: added,
  } = useSuspenseQuery(
    calendarRangeQuery({
      from: window.from,
      to: window.to,
      child: search.child,
    }),
  ).data;
  const hidden = new Set(search.hide);
  const events = all.filter((event) => !hidden.has(event.category));
  const categories: ShownCategory[] = [...CALENDAR_CATEGORIES, ...added];
  const toggle = (category: ShownCategory) =>
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
      event.origin === null &&
      (canManage || (canAuthor && event.authorUserId === user.id)),
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
    <Page width="list">
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
      <div className="grid gap-4">
        <ToolbarRow.Provider value>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 max-md:w-full">
              <ButtonLink
                to="/calendar"
                search={(previous) => ({ ...previous, ...step(-1) })}
                variant="outline"
                size="icon-sm"
                className="max-md:size-10"
                aria-label={week ? m.calPreviousWeek() : m.calPrevious()}
              >
                <ChevronLeft className="rtl:rotate-180" aria-hidden />
              </ButtonLink>
              <h2
                className="min-w-44 text-center text-base leading-6 font-semibold max-md:flex-1"
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
                size="icon-sm"
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
                  size="sm"
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
                className="ms-1 h-8 w-40 max-md:ms-0 max-md:h-10 max-md:w-full"
                value={window.anchor}
                onChange={(event) => {
                  if (event.target.value) jump(event.target.value);
                }}
              />
            </div>
            <div className="flex items-center gap-2 max-md:w-full">
              <Segmented<View>
                label={m.calView()}
                value={view}
                options={[
                  { value: "month", label: m.calViewMonth() },
                  { value: "week", label: m.calViewWeek() },
                  { value: "agenda", label: m.calViewAgenda() },
                ]}
                onChange={(next) =>
                  void navigate({
                    search: (previous) => ({ ...previous, view: next }),
                  })
                }
              />
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
                    categories={categories}
                    hidden={hidden}
                    onToggle={toggle}
                    onShowAll={showAll}
                  />
                </div>
                <Subscribe />
              </div>
            </div>
          </div>
        </ToolbarRow.Provider>
        {children.length > 1 ? (
          <IndexToolbar
            facets={[
              {
                id: "child",
                label: m.courseworkChild(),
                single: true,
                options: children.map((child) => ({
                  value: child.id,
                  label: inLocale(child.nameEn, child.nameAr),
                })),
                selected: search.child ? [search.child] : [],
                onChange: ([next]) =>
                  void navigate({
                    search: (previous) => ({ ...previous, child: next ?? "" }),
                  }),
              },
            ]}
          />
        ) : null}
        <fieldset className="flex flex-wrap items-center gap-1.5 max-md:hidden">
          <legend className="sr-only">{m.calLegend()}</legend>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={!hidden.has(category)}
              onClick={() => toggle(category)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted aria-pressed:border-border aria-pressed:bg-card aria-pressed:text-foreground [&:not([aria-pressed=true])]:line-through"
            >
              <CategoryIcon
                category={category}
                className={cn(
                  "size-3.5",
                  hidden.has(category) && "text-muted-foreground",
                )}
              />
              {words.label(category)}
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
        {view === "month" ? (
          <div className="grid gap-2">
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
          </div>
        ) : view === "week" ? (
          <div className="grid gap-2">
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
          </div>
        ) : (
          <div>
            <Agenda
              from={window.anchor}
              to={last}
              today={user.today}
              events={events}
              days={days}
            />
          </div>
        )}
      </div>
      {dialog}
      <EventSheet
        eventId={search.event || null}
        onClose={() =>
          void navigate({
            search: (previous) => ({ ...previous, event: "" }),
          })
        }
      />
    </Page>
  );
}
