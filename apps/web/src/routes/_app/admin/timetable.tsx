import { Input } from "@faridalms/ui/input";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { CalendarCheck2, CalendarX2 } from "lucide-react";
import * as v from "valibot";

import type { Column } from "~/components/system/DataTable";

import { classTitle } from "~/components/classes/format";
import { displayName } from "~/components/people/format";
import { DataTable, RowLink } from "~/components/system/DataTable";
import { SelectField } from "~/components/system/field";
import { EmptyState, PageHeader } from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { CoverDay } from "~/components/timetable/Cover";
import { Planner } from "~/components/timetable/Planner";
import { dayName } from "~/components/timetable/WeekGrid";
import {
  roomLabel,
  RoomWeek,
  teacherLabel,
  TeacherWeek,
} from "~/components/timetable/Weeks";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  clashesQuery,
  coverDayQuery,
  roomWeekQuery,
  teacherWeekQuery,
  timetableGridQuery,
  timetableOptionsQuery,
} from "~/queries/timetable";

const VIEWS = ["classes", "teachers", "rooms", "cover", "clashes"] as const;
type View = (typeof VIEWS)[number];

const uuid = v.pipe(v.string(), v.uuid());
const searchSchema = v.object({
  view: v.fallback(v.optional(v.picklist(VIEWS), "classes"), "classes"),
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

export const Route = createFileRoute("/_app/admin/timetable")({
  staticData: { section: "/admin/timetable" },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const { queryClient } = context;
    const options = await queryClient.ensureQueryData(timetableOptionsQuery);
    const picked = pickedOf(deps, options);
    if (deps.view === "classes" && picked.classId)
      await queryClient.ensureQueryData(
        timetableGridQuery(picked.classId, picked.from),
      );
    else if (deps.view === "teachers" && picked.teacherId)
      await queryClient.ensureQueryData(
        teacherWeekQuery(picked.teacherId, picked.from),
      );
    else if (deps.view === "rooms" && picked.roomId)
      await queryClient.ensureQueryData(
        roomWeekQuery(picked.roomId, picked.from),
      );
    else if (deps.view === "cover")
      await queryClient.ensureQueryData(coverDayQuery(picked.from));
    else if (deps.view === "clashes")
      await queryClient.ensureQueryData(clashesQuery(picked.from));
  },
  component: TimetablePage,
});

type Options = Awaited<
  ReturnType<NonNullable<(typeof timetableOptionsQuery)["queryFn"]>>
>;

/** What each view shows when nothing is picked yet: the first of each. */
function pickedOf(search: Search, options: Options) {
  const today = options.today;
  const year = options.year;
  const from =
    search.from ||
    (year
      ? today < year.startsOn
        ? year.startsOn
        : today > year.lastDay
          ? year.lastDay
          : today
      : today);
  return {
    from,
    classId: search.classId || options.grids[0]?.id || "",
    teacherId: search.teacherId || options.teachers[0]?.userId || "",
    roomId: search.roomId || options.rooms[0]?.id || "",
  };
}

const VIEW_LABEL: Record<View, () => string> = {
  classes: m.ttByClass,
  teachers: m.ttByTeacher,
  rooms: m.ttByRoom,
  cover: m.ttCover,
  clashes: m.ttClashes,
};

type Clash = Awaited<
  ReturnType<NonNullable<ReturnType<typeof clashesQuery>["queryFn"]>>
>["rows"][number];

function ClashGrid({ row }: { row: Clash }) {
  return (
    <RowLink
      to="/admin/timetable"
      search={{ view: "classes", classId: row.groupClassId }}
    >
      {classTitle({
        code: row.groupCode,
        titleEn: row.groupTitleEn,
        titleAr: row.groupTitleAr,
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

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function clashColumns(periods: Map<string, string>): Column<Clash>[] {
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
        `${dayName(row.weekday)} · ${periods.get(row.periodId) ?? ""}`,
    },
    {
      id: "teacher",
      header: m.ttTeacher(),
      cell: (row) => teacherLabel(row) ?? "–",
    },
    { id: "room", header: m.ttRoom(), cell: (row) => roomLabel(row) ?? "–" },
  ];
}

const clashCard = {
  title: (row: Clash) => <ClashGrid row={row} />,
  status: () => <StatusText tone="warning">{m.ttClash()}</StatusText>,
  fact: (row: Clash) => `${clashLesson(row)} · ${dayName(row.weekday)}`,
};

function Clashes({ from }: { from: string }) {
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
      columns={clashColumns(periods)}
      rowLabel={(row) => clashLesson(row)}
      card={clashCard}
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
  const options = useSuspenseQuery(timetableOptionsQuery).data;
  const picked = pickedOf(search, options);
  const patch = (change: Partial<Search>) =>
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  if (!options.year)
    return (
      <>
        <PageHeader title={m.ttTitle()} />
        <EmptyState icon={CalendarX2} title={m.ttNoYear()} />
      </>
    );
  const picker =
    search.view === "classes" ? (
      <SelectField
        id="timetable-class"
        label={m.ttGrid()}
        width="name"
        className="w-64"
        value={picked.classId}
        options={options.grids.map((row) => ({
          value: row.id,
          label: classTitle(row),
        }))}
        onChange={(classId) => patch({ classId })}
      />
    ) : search.view === "teachers" ? (
      <SelectField
        id="timetable-teacher"
        label={m.ttTeacher()}
        width="name"
        className="w-64"
        value={picked.teacherId}
        options={options.teachers.map((row) => ({
          value: row.userId,
          label: displayName(row),
        }))}
        onChange={(teacherId) => patch({ teacherId })}
      />
    ) : search.view === "rooms" ? (
      <SelectField
        id="timetable-room"
        label={m.ttRoom()}
        width="name"
        className="w-64"
        value={picked.roomId}
        options={options.rooms.map((row) => ({
          value: row.id,
          label: inLocale(row.nameEn, row.nameAr) || (row.code ?? ""),
        }))}
        onChange={(roomId) => patch({ roomId })}
      />
    ) : null;
  return (
    <>
      <PageHeader title={m.ttTitle()} description={m.ttAdminHint()} />
      <RecordTabs
        label={m.ttTitle()}
        tabs={VIEWS.map((value) => ({ value, label: VIEW_LABEL[value]() }))}
        value={search.view}
        onChange={(view) =>
          void navigate({ search: { view, from: search.from } })
        }
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-3">
            {picker}
            <div className="grid gap-1.5">
              <label
                htmlFor="timetable-from"
                className="text-sm leading-5 font-medium"
              >
                {search.view === "classes"
                  ? m.ttChangesFrom()
                  : search.view === "cover"
                    ? m.ttDay()
                    : m.ttWeekOf()}
              </label>
              <Input
                id="timetable-from"
                type="date"
                className="w-40 max-md:h-10"
                value={picked.from}
                min={options.year.startsOn}
                max={options.year.lastDay}
                onChange={(event) =>
                  event.target.value && patch({ from: event.target.value })
                }
              />
            </div>
          </div>
          {search.view === "classes" && picked.classId ? (
            <Planner classId={picked.classId} from={picked.from} />
          ) : search.view === "teachers" && picked.teacherId ? (
            <TeacherWeek teacherId={picked.teacherId} on={picked.from} />
          ) : search.view === "rooms" && picked.roomId ? (
            <RoomWeek roomId={picked.roomId} on={picked.from} />
          ) : search.view === "cover" ? (
            <CoverDay on={picked.from} />
          ) : search.view === "clashes" ? (
            <Clashes from={picked.from} />
          ) : null}
        </div>
      </RecordTabs>
    </>
  );
}
