import type { Capability } from "@faridalms/domain/capabilities";
import type { Column } from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { Input } from "@faridalms/ui/input";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { CalendarCheck2 } from "lucide-react";
import * as v from "valibot";

import type { CardCell } from "~/components/timetable/Weeks";

import { classTitle } from "~/components/classes/format";
import {
  classFilters,
  viewsOf as classViewsOf,
} from "~/components/classes/slots";
import { displayName } from "~/components/people/format";
import { CoverDay } from "~/components/timetable/Cover";
import { cycleDayLabel } from "~/components/timetable/cycle";
import { Planner } from "~/components/timetable/Planner";
import { SchoolDay } from "~/components/timetable/SchoolDay";
import { Timetables } from "~/components/timetable/Timetables";
import {
  roomLabel,
  RoomWeek,
  teacherLabel,
  TeacherWeek,
} from "~/components/timetable/Weeks";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import { loadTeaches, useTeaches } from "~/hooks/useTeaches";
import * as m from "~/i18n/messages";
import { schoolPeriodsQuery } from "~/queries/periods";
import {
  clashesQuery,
  coverDayQuery,
  roomWeekQuery,
  teacherWeekQuery,
  timetableGridQuery,
  timetableOptionsQuery,
  timetablesQuery,
} from "~/queries/timetable";
import { currentUserQuery } from "~/queries/user";
import { filled } from "~/utils/extension";
import { requirePage } from "~/utils/page-access";

const VIEWS = [
  "mine",
  "classes",
  "teachers",
  "rooms",
  "cover",
  "clashes",
  "timetables",
  "day",
] as const;
type View = (typeof VIEWS)[number];
type SchoolView = Exclude<View, "mine">;
const SCHOOL_VIEWS = VIEWS.filter((view) => view !== "mine");

const uuid = v.pipe(v.string(), v.uuid());
// Loose, so a module's view of the classes rides in the address under its own key.
const searchSchema = v.looseObject({
  view: v.fallback(v.optional(v.picklist(VIEWS)), undefined),
  classId: v.optional(v.union([v.literal(""), uuid]), ""),
  teacherId: v.optional(v.union([v.literal(""), uuid]), ""),
  roomId: v.optional(v.union([v.literal(""), uuid]), ""),
  from: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]),
    "",
  ),
});
type Search = v.InferOutput<typeof searchSchema>;

const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/_staff/timetable")({
  staticData: { section: "/timetable" },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const { queryClient } = context;
    const [user, teaches] = await Promise.all([
      queryClient.ensureQueryData(currentUserQuery),
      loadTeaches(queryClient),
    ]);
    requirePage(user, "timetable:read", "timetable:manage");
    const view = viewOf(deps, viewsOf(user, teaches));
    if (view === "mine") {
      await queryClient.ensureQueryData(teacherWeekQuery());
      return;
    }
    const filters = filled(context.extensions, user.modules, classFilters);
    const [options] = await Promise.all([
      queryClient.ensureQueryData(
        timetableOptionsQuery(classViewsOf(filters, deps)),
      ),
      ...filters.map((filter) => queryClient.ensureQueryData(filter.query())),
    ]);
    const picked = pickedOf(deps, options);
    if (view === "classes" && picked.classId)
      await queryClient.ensureQueryData(
        timetableGridQuery(picked.classId, picked.from),
      );
    else if (view === "teachers" && picked.teacherId)
      await queryClient.ensureQueryData(
        teacherWeekQuery(picked.teacherId, picked.from),
      );
    else if (view === "rooms" && picked.roomId)
      await queryClient.ensureQueryData(
        roomWeekQuery(picked.roomId, picked.from),
      );
    else if (view === "cover")
      await queryClient.ensureQueryData(coverDayQuery(picked.from));
    else if (view === "clashes")
      await queryClient.ensureQueryData(clashesQuery(picked.from));
    else if (view === "timetables")
      await queryClient.ensureQueryData(timetablesQuery);
    else if (view === "day")
      await queryClient.ensureQueryData(schoolPeriodsQuery(deps.from));
  },
  component: TimetablePage,
});

/**
 * The viewer's own week for whoever teaches, then the school's planner for
 * whoever builds it; an overseer who teaches nothing is not offered an
 * empty week.
 */
function viewsOf(
  user: { capabilities: readonly Capability[] },
  teaches: boolean,
): View[] {
  const manages = user.capabilities.includes("timetable:manage");
  return [
    ...(teaches || !manages ? (["mine"] as const) : []),
    ...(manages ? SCHOOL_VIEWS : []),
  ];
}

function viewOf(search: Search, views: View[]): View {
  return search.view && views.includes(search.view)
    ? search.view
    : (views[0] ?? "mine");
}

/** Today's lessons open their register; other days only show. */
function registerCell(date: string): CardCell {
  return function renderCell({ meeting, period, card }) {
    if (meeting.on !== date || meeting.change?.cancelled) return card;
    return (
      <Link
        to="/registers/$classId"
        params={{ classId: meeting.classId }}
        search={{ date, periodId: period.id }}
        aria-label={m.ttOpenRegister({ lesson: meeting.classCode })}
        className="block h-full rounded-md hover:ring-2 hover:ring-ring/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {card}
      </Link>
    );
  };
}

type Options = Awaited<
  ReturnType<NonNullable<ReturnType<typeof timetableOptionsQuery>["queryFn"]>>
>;

/** What each view shows when nothing is picked yet: the first of each, on the day its view reads. */
function pickedOf(search: Search, options: Options) {
  return {
    from: search.from || options.on,
    classId: search.classId || options.grids[0]?.id || "",
    teacherId: search.teacherId || options.teachers[0]?.userId || "",
    roomId: search.roomId || options.rooms[0]?.id || "",
  };
}

const VIEW_LABEL: Record<View, () => string> = {
  mine: m.ttMine,
  classes: m.ttByClass,
  teachers: m.ttByTeacher,
  rooms: m.ttByRoom,
  cover: m.ttCover,
  clashes: m.ttClashes,
  timetables: m.ttTimetables,
  day: m.ttSchoolDay,
};

type Clash = Awaited<
  ReturnType<NonNullable<ReturnType<typeof clashesQuery>["queryFn"]>>
>["rows"][number];

interface ClashGridProps {
  row: Clash;
}

function ClashGrid({ row }: ClashGridProps) {
  return (
    <RowLink
      to="/timetable"
      search={{ view: "classes", classId: row.gridClassId }}
    >
      {classTitle({
        code: row.gridCode,
        titleEn: row.gridTitleEn,
        titleAr: row.gridTitleAr,
      })}
    </RowLink>
  );
}

function clashLesson(row: Clash) {
  return classTitle({
    code: row.classCode,
    titleEn: row.classTitleEn,
    titleAr: row.classTitleAr,
  });
}

type ClashCycle = Awaited<
  ReturnType<NonNullable<ReturnType<typeof clashesQuery>["queryFn"]>>
>["timetable"];

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function clashColumns(
  periods: Map<string, string>,
  cycle: ClashCycle,
): Column<Clash>[] {
  return [
    {
      id: "grid",
      header: m.ttGrid(),
      primary: true,
      cell: (row) => <ClashGrid row={row} />,
    },
    { id: "lesson", header: m.ttClass(), cell: (row) => clashLesson(row) },
    {
      id: "when",
      header: m.ttWhen(),
      cell: (row) =>
        `${cycleDayLabel(cycle, row.weekday)} · ${periods.get(row.periodId) ?? ""}`,
    },
    {
      id: "teacher",
      header: m.ttTeacher(),
      cell: (row) => teacherLabel(row) ?? "–",
    },
    { id: "room", header: m.ttRoom(), cell: (row) => roomLabel(row) ?? "–" },
  ];
}

const clashCard = (cycle: ClashCycle) => ({
  title: (row: Clash) => <ClashGrid row={row} />,
  status: () => <StatusText tone="warning">{m.ttClash()}</StatusText>,
  fact: (row: Clash) =>
    `${clashLesson(row)} · ${cycleDayLabel(cycle, row.weekday)}`,
});

interface ClashesProps {
  from: string;
}

function Clashes({ from }: ClashesProps) {
  const data = useSuspenseQuery(clashesQuery(from)).data;
  const periods = new Map(
    data.periods.map((period) => [
      period.id,
      inLocale(period.nameEn, period.nameAr),
    ]),
  );
  return (
    <DataTable
      caption={m.ttClashesCaption()}
      rows={data.rows}
      columns={clashColumns(periods, data.timetable)}
      rowLabel={(row) => clashLesson(row)}
      card={clashCard(data.timetable)}
      empty={{
        icon: CalendarCheck2,
        title: m.ttNoClashes(),
        description: m.ttNoClashesBody(),
      }}
    />
  );
}

function TimetablePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const views = viewsOf(user, useTeaches());
  const view = viewOf(search, views);
  const body =
    view === "mine" ? (
      <TeacherWeek cell={registerCell(user.today)} />
    ) : (
      <SchoolTimetable
        view={view}
        search={search}
        patch={(change) =>
          void navigate({ search: (previous) => ({ ...previous, ...change }) })
        }
      />
    );
  return (
    <Page width="list">
      <PageHeader
        title={m.ttTitle()}
        description={view === "mine" ? m.ttTeacherHint() : m.ttAdminHint()}
      />
      {views.length > 1 ? (
        <RecordTabs
          label={m.ttTitle()}
          tabs={views.map((value) => ({ value, label: VIEW_LABEL[value]() }))}
          value={view}
          onChange={(next) =>
            void navigate({
              resetScroll: false,
              search: { view: next, from: search.from },
            })
          }
        >
          {body}
        </RecordTabs>
      ) : (
        body
      )}
    </Page>
  );
}

/** The one class, teacher or room a school view shows. */
function pickerFacet(
  id: string,
  label: string,
  value: string,
  choices: Facet["options"],
  onChange: (value: string) => void,
): Facet {
  return {
    id,
    label,
    single: true,
    defaultSelected: [value],
    selected: [value],
    options: choices,
    onChange: ([next]) => {
      if (next) onChange(next);
    },
  };
}

interface SchoolTimetableProps {
  view: SchoolView;
  search: Search;
  patch: (change: Partial<Search>) => void;
}

function SchoolTimetable({ view, search, patch }: SchoolTimetableProps) {
  const filters = useSlot(classFilters);
  const reads = useSuspenseQueries({
    queries: filters.map((filter) => filter.query()),
  });
  const options = useSuspenseQuery(
    timetableOptionsQuery(classViewsOf(filters, search)),
  ).data;
  const picked = pickedOf(search, options);
  const classFacets: Facet[] =
    view === "classes"
      ? filters.flatMap((filter, index) => {
          const value = search[filter.key];
          const facet = filter.facetOf(
            reads[index]?.data,
            typeof value === "string" && value ? value : undefined,
            (next) => patch({ [filter.key]: next, classId: "" }),
          );
          return facet ? [facet] : [];
        })
      : [];
  const picker =
    view === "classes"
      ? pickerFacet(
          "class",
          m.ttGrid(),
          picked.classId,
          options.grids.map((row) => ({
            value: row.id,
            label: classTitle(row),
          })),
          (classId) => patch({ classId }),
        )
      : view === "teachers"
        ? pickerFacet(
            "teacher",
            m.ttTeacher(),
            picked.teacherId,
            options.teachers.map((row) => ({
              value: row.userId,
              label: displayName(row),
            })),
            (teacherId) => patch({ teacherId }),
          )
        : view === "rooms"
          ? pickerFacet(
              "room",
              m.ttRoom(),
              picked.roomId,
              options.rooms.map((row) => ({
                value: row.id,
                label: inLocale(row.nameEn, row.nameAr) || (row.code ?? ""),
              })),
              (roomId) => patch({ roomId }),
            )
          : null;
  if (view === "timetables") return <Timetables />;
  return (
    <div className="grid gap-4">
      <IndexToolbar
        facets={[...classFacets, ...(picker ? [picker] : [])]}
        period={
          <Input
            type="date"
            aria-label={
              view === "classes"
                ? m.ttChangesFrom()
                : view === "cover" || view === "day"
                  ? m.ttDay()
                  : m.ttWeekOf()
            }
            className="h-8 w-40 max-md:h-10"
            value={picked.from}
            onChange={(event) =>
              event.target.value && patch({ from: event.target.value })
            }
          />
        }
      />
      {view === "classes" && picked.classId ? (
        <Planner
          classId={picked.classId}
          from={picked.from}
          onFrom={(from) => patch({ from })}
        />
      ) : view === "teachers" && picked.teacherId ? (
        <TeacherWeek teacherId={picked.teacherId} on={picked.from} />
      ) : view === "rooms" && picked.roomId ? (
        <RoomWeek roomId={picked.roomId} on={picked.from} />
      ) : view === "cover" ? (
        <CoverDay on={picked.from} />
      ) : view === "day" ? (
        <SchoolDay on={picked.from} />
      ) : (
        <Clashes from={picked.from} />
      )}
    </div>
  );
}
