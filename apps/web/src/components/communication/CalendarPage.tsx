import type { CalendarQuery } from "@faridalms/domain/school-schema";

import { shiftMonth } from "@faridalms/domain/school";
import { EVENT_CATEGORIES } from "@faridalms/domain/school-schema";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import arLocale from "@fullcalendar/react/locales/ar";
import breezyTheme from "@fullcalendar/react/themes/breezy";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Plus,
  Rows3,
  Search,
} from "lucide-react";

import { EVENT_CATEGORY_LABEL } from "~/components/app/labels";
import { PageHeader } from "~/components/app/primitives";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { usePermission } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { calendarQuery } from "~/queries/school";
import { saveCalendarEvent } from "~/server/school";
import { cn } from "~/utils/cn";
import { formatDate, formatMonthLabel, formatNumber } from "~/utils/datetime";

import { eventColors, shiftDate } from "./calendar-model";
import { CalendarEventDialog } from "./CalendarEventDialog";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/breezy/theme.css";
import "@fullcalendar/react/themes/breezy/palettes/emerald.css";

import "~/styles/calendar.css";

const views = {
  month: "dayGridMonth",
  week: "dayGridWeek",
  agenda: "listMonth",
};
const viewIcons = { month: CalendarDays, week: Rows3, agenda: List };

export function CalendarPage({ search }: { search: CalendarQuery }) {
  const navigate = useNavigate();
  const data = useSuspenseQuery(calendarQuery(search)).data;
  const canManage = usePermission("calendar:manage");
  const text = search.q;
  const mutation = useMutation({ mutationFn: saveCalendarEvent });
  const date =
    search.date || (search.month ? `${search.month}-01` : data.today);
  const setSearch = (patch: Partial<CalendarQuery>) => {
    void navigate({ to: ".", search: { ...search, ...patch } });
  };
  const move = (offset: number) => {
    const next =
      search.view === "week"
        ? shiftDate(date, offset * 7)
        : `${shiftMonth(date.slice(0, 7), offset)}-01`;
    setSearch({ date: next, month: next.slice(0, 7) });
  };
  const labels = {
    month: m.calendarMonthView(),
    week: m.calendarWeekView(),
    agenda: m.calendarAgenda(),
  };
  const events = data.allEvents.filter(
    (event) =>
      search.showEvents &&
      event.title
        .toLocaleLowerCase(getLocale())
        .includes(text.toLocaleLowerCase(getLocale())),
  );
  const selected = data.allEvents.find((event) => event.id === search.event);
  const future = events.filter((event) => event.endsOn >= date).slice(0, 4);
  return (
    <>
      <PageHeader
        title={m.calendarTitle()}
        description={m.calendarWorkspaceHint()}
        actions={
          canManage ? (
            <Button onClick={() => setSearch({ event: "new" })}>
              <Plus aria-hidden />
              {m.calendarAddEvent()}
            </Button>
          ) : undefined
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="space-y-6 rounded-2xl border bg-card p-5 xl:sticky xl:top-24">
          <div>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {m.calendarJumpToDate()}
            </p>
            <Input
              className="mt-3"
              type="date"
              aria-label={m.calendarJumpToDate()}
              value={date}
              onChange={(e) => {
                if (e.target.value)
                  setSearch({
                    date: e.target.value,
                    month: e.target.value.slice(0, 7),
                  });
              }}
            />
          </div>
          <fieldset className="flex flex-wrap gap-3 xl:flex-col">
            <legend className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {m.commCalendarCategories()}
            </legend>
            {EVENT_CATEGORIES.map((category) => (
              <label
                key={category}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={
                    search.showEvents &&
                    (search.categories.length === 0 ||
                      search.categories.includes(category))
                  }
                  onCheckedChange={() => {
                    const current = !search.showEvents
                      ? []
                      : search.categories.length === 0
                        ? [...EVENT_CATEGORIES]
                        : search.categories;
                    const next = current.includes(category)
                      ? current.filter((value) => value !== category)
                      : [...current, category];
                    setSearch({
                      categories: next,
                      showEvents: next.length > 0,
                    });
                  }}
                />
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: eventColors[category] }}
                />
                {EVENT_CATEGORY_LABEL[category]()}
              </label>
            ))}
          </fieldset>
          <div className="hidden border-t pt-5 xl:block">
            <h2 className="mb-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {m.overviewUpcoming()}
            </h2>
            <div className="space-y-4">
              {future.map((event) => (
                <button
                  key={event.id}
                  className="block w-full text-start"
                  onClick={() => setSearch({ event: event.id })}
                >
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(event.startsOn)}
                  </span>
                  <span className="mt-1 block text-sm font-medium hover:text-primary">
                    {event.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
        <section
          className="min-w-0 overflow-hidden rounded-2xl border bg-card"
          aria-label={m.calendarTitle()}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                {formatMonthLabel(date.slice(0, 7))}
              </h2>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.calendarPreviousPeriod()}
                  onClick={() => move(-1)}
                >
                  <ChevronLeft className="rtl:rotate-180" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.calendarNextPeriod()}
                  onClick={() => move(1)}
                >
                  <ChevronRight className="rtl:rotate-180" aria-hidden />
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSearch({ date: data.today, month: data.today.slice(0, 7) })
                }
              >
                {m.commonToday()}
              </Button>
            </div>
            <fieldset
              className="flex rounded-lg bg-muted p-1"
              aria-label={m.calendarViewLabel()}
            >
              {(["month", "week", "agenda"] as const).map((view) => {
                const Icon = viewIcons[view];
                return (
                  <Button
                    key={view}
                    variant="ghost"
                    size="sm"
                    aria-pressed={view === search.view}
                    className={cn(view === search.view && "bg-card shadow-sm")}
                    onClick={() => setSearch({ view })}
                  >
                    <Icon className="size-4" aria-hidden />
                    <span>{labels[view]}</span>
                  </Button>
                );
              })}
            </fieldset>
          </div>
          <div className="flex items-center gap-3 border-b px-5 py-3">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <Input
              className="h-8 border-0 bg-transparent shadow-none"
              aria-label={m.calendarSearch()}
              placeholder={m.calendarSearch()}
              value={text}
              onChange={(e) => setSearch({ q: e.target.value })}
            />
            <span className="shrink-0 text-xs text-muted-foreground">
              {m.calendarEventCount({ count: formatNumber(events.length) })}
            </span>
          </div>
          <section
            className="farida-calendar overflow-x-auto p-2 sm:p-4"
            aria-label={m.calendarWorkspaceHint()}
          >
            <FullCalendar
              key={`${search.view}:${date}`}
              plugins={[
                dayGridPlugin,
                interactionPlugin,
                listPlugin,
                breezyTheme,
              ]}
              initialView={views[search.view]}
              initialDate={date}
              now={data.today}
              headerToolbar={false}
              locales={[arLocale]}
              locale={getLocale()}
              direction={getLocale() === "ar" ? "rtl" : "ltr"}
              height="auto"
              fixedWeekCount={false}
              dayMaxEvents={3}
              editable={canManage}
              selectable={canManage}
              eventStartEditable={canManage}
              eventDurationEditable={canManage}
              eventInteractive
              noEventsContent={m.calendarNoEvents()}
              events={events.map((event) => ({
                id: event.id,
                title: event.title,
                start: event.startsOn,
                end: shiftDate(event.endsOn, 1),
                allDay: true,
                color: eventColors[event.category],
              }))}
              eventClick={(info) => setSearch({ event: info.event.id })}
              dateClick={(info) =>
                setSearch({
                  date: info.dateStr,
                  month: info.dateStr.slice(0, 7),
                  event: canManage ? "new" : "",
                  view: canManage ? search.view : "agenda",
                })
              }
              eventDrop={(info) => {
                const event = data.allEvents.find(
                  (row) => row.id === info.event.id,
                );
                if (!event) {
                  info.revert();
                  return;
                }
                mutation.mutate(
                  {
                    data: {
                      ...event,
                      description: event.description ?? "",
                      document: event.document ?? undefined,
                      expectedRevision: event.revision,
                      startsOn: info.event.startStr.slice(0, 10),
                      endsOn: info.event.endStr
                        ? shiftDate(info.event.endStr.slice(0, 10), -1)
                        : info.event.startStr.slice(0, 10),
                    },
                  },
                  { onError: () => info.revert() },
                );
              }}
              eventResize={(info) => {
                const event = data.allEvents.find(
                  (row) => row.id === info.event.id,
                );
                if (!event) {
                  info.revert();
                  return;
                }
                mutation.mutate(
                  {
                    data: {
                      ...event,
                      description: event.description ?? "",
                      document: event.document ?? undefined,
                      expectedRevision: event.revision,
                      startsOn: info.event.startStr.slice(0, 10),
                      endsOn: shiftDate(info.event.endStr.slice(0, 10), -1),
                    },
                  },
                  { onError: () => info.revert() },
                );
              }}
            />
          </section>
          <div className="border-t px-5 py-3 text-xs text-muted-foreground">
            {canManage ? m.calendarManageHint() : m.calendarReadHint()}
          </div>
        </section>
      </div>
      {selected || (search.event === "new" && canManage) ? (
        <CalendarEventDialog
          key={search.event}
          event={selected}
          date={date}
          canManage={canManage}
          onClose={() => setSearch({ event: "" })}
        />
      ) : null}
    </>
  );
}
