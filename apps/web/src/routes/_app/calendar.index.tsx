import type { CalendarCategory } from "@faridalms/domain/calendar";
import type { IsoWeekday } from "@faridalms/domain/timetable";
import type { Workspace } from "@faridalms/domain/workspace";

import { CALENDAR_CATEGORIES, monthWeeks } from "@faridalms/domain/calendar";
import { addDays, shiftMonth } from "@faridalms/domain/school";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import * as v from "valibot";

import { ButtonLink } from "~/components/app/ButtonLink";
import { CATEGORY_LABEL } from "~/components/calendar/format";
import { Agenda, CategoryIcon, MonthGrid } from "~/components/calendar/views";
import { PageHeader } from "~/components/system/IndexPage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { calendarRangeQuery } from "~/queries/calendar";
import { currentUserQuery } from "~/queries/user";
import { cn } from "~/utils/cn";
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
  /** Kinds of event switched off in the legend. */
  hide: v.fallback(
    v.optional(v.array(v.picklist(CALENDAR_CATEGORIES)), []),
    [],
  ),
  child: v.fallback(
    v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
    "",
  ),
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
      calendarRangeQuery({
        from: window.from,
        to: window.to,
        child: deps.child,
      }),
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
  const {
    events: all,
    days,
    canAuthor,
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
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">{m.calLegend()}</legend>
          {CALENDAR_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={!hidden.has(category)}
              onClick={() => toggle(category)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted aria-pressed:border-border aria-pressed:bg-card aria-pressed:text-foreground max-md:h-10 [&:not([aria-pressed=true])]:border-dashed [&:not([aria-pressed=true])]:line-through"
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
              onClick={() =>
                void navigate({
                  search: (previous) => ({ ...previous, hide: [] }),
                })
              }
              className="ms-1 h-8 rounded-md px-2 text-[13px] font-medium text-primary hover:bg-muted max-md:h-10"
            >
              {m.calShowAll()}
            </button>
          ) : null}
        </fieldset>
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
