import type { CSSProperties } from "react";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarRange } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { unitPlanQuery } from "~/queries/learning";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { setUnitDates } from "~/server/learning";
import { formatDayRange, formatMonthShort } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { STATE_LABEL, shownState } from "./format";

type MapData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof unitPlanQuery>["queryFn"]>>
>;
type YearData = MapData & { frame: NonNullable<MapData["frame"]> };
type Unit = YearData["units"][number];

const DAY_MS = 86_400_000;
const dayOf = (isoDate: string) => Date.parse(`${isoDate}T00:00:00.000Z`);
const isoOf = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Where a span of days sits along the year, as shares of its width. */
function placeIn(
  year: { startsOn: string; endsBefore: string },
  first: string,
  endsBefore: string,
): CSSProperties {
  const start = dayOf(year.startsOn);
  const length = dayOf(year.endsBefore) - start;
  const from = Math.max(0, (dayOf(first) - start) / length);
  const to = Math.min(1, (dayOf(endsBefore) - start) / length);
  return {
    insetInlineStart: `${from * 100}%`,
    width: `${Math.max(0, to - from) * 100}%`,
  };
}

/** The first day of each month the year runs through, its own first included. */
function monthsOf(year: { startsOn: string; endsBefore: string }) {
  const months: string[] = [year.startsOn];
  const cursor = new Date(dayOf(year.startsOn));
  cursor.setUTCDate(1);
  for (;;) {
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    const first = isoOf(cursor.getTime());
    if (first >= year.endsBefore) return months;
    months.push(first);
  }
}

const nextDay = (isoDate: string) => isoOf(dayOf(isoDate) + DAY_MS);

export interface YearMapProps {
  map: YearData;
  today: string;
}

/**
 * A class's units laid along its school year: the months and terms as a
 * scale, each unit a bar from its first day to its last, and today marked.
 * A phone shows each unit's days as words, which the bars only draw.
 */
export function YearMap({ map, today }: YearMapProps) {
  const [dating, setDating] = useState<{ key: number; unit: Unit | null }>({
    key: 0,
    unit: null,
  });
  const { frame: year } = map;
  const months = monthsOf(year);
  const todayShown = today >= year.startsOn && today < year.endsBefore;
  const todayAt = placeIn(year, today, nextDay(today));
  const track = "relative hidden md:block";
  const lastEnd = map.units.reduce<string | null>(
    (latest, unit) =>
      unit.endsOn && (!latest || unit.endsOn > latest) ? unit.endsOn : latest,
    null,
  );
  return (
    <section
      aria-label={m.yearMapCaption()}
      className="grid gap-1 rounded-lg border bg-card px-4 py-3"
    >
      <div
        aria-hidden
        className="hidden grid-cols-[minmax(12rem,16rem)_1fr_2.5rem] gap-x-4 md:grid"
      >
        <span />
        <div className="grid gap-1">
          <div className="relative h-5">
            {months.map((first) => (
              <span
                key={first}
                className="absolute top-0 border-s ps-1 text-xs leading-5 text-muted-foreground"
                style={placeIn(year, first, first)}
              >
                {formatMonthShort(first)}
              </span>
            ))}
          </div>
          {year.parts.length > 0 ? (
            <div className="relative h-6">
              {year.parts.map((term) => (
                <span
                  key={term.id}
                  className="absolute top-0 truncate rounded-sm bg-muted px-1.5 text-xs leading-6 text-muted-foreground"
                  style={placeIn(year, term.startsOn, term.endsBefore)}
                >
                  {inLocale(term.titleEn, term.titleAr)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <span />
      </div>
      <ol className="grid divide-y">
        {map.units.map((unit) => {
          const state = shownState(unit);
          return (
            <li
              key={unit.id}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2 md:grid-cols-[minmax(12rem,16rem)_1fr_2.5rem]"
            >
              <div className="grid min-w-0">
                <Link
                  to="/modules/$moduleId"
                  params={{ moduleId: unit.id }}
                  search={{}}
                  className="truncate text-sm leading-5 font-medium hover:text-primary hover:underline"
                >
                  {unit.title}
                </Link>
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {[
                    unit.startsOn && unit.endsOn
                      ? formatDayRange(unit.startsOn, unit.endsOn)
                      : m.yearMapNoDates(),
                    state === "published" ? null : STATE_LABEL[state](),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div aria-hidden className={cn(track, "h-7")}>
                <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
                {todayShown ? (
                  <span
                    className="absolute inset-y-0 w-px bg-primary/70"
                    style={todayAt}
                  />
                ) : null}
                {unit.startsOn && unit.endsOn ? (
                  <span
                    className={cn(
                      "absolute inset-y-1 min-w-1.5 rounded-sm",
                      state === "published"
                        ? "bg-primary/70"
                        : "border border-dashed border-muted-foreground/60 bg-muted",
                    )}
                    style={placeIn(year, unit.startsOn, nextDay(unit.endsOn))}
                  />
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="max-md:size-10"
                aria-label={m.yearMapSetDates({ title: unit.title })}
                title={m.yearMapSetDates({ title: unit.title })}
                onClick={() =>
                  setDating((current) => ({ key: current.key + 1, unit }))
                }
              >
                <CalendarRange aria-hidden />
              </Button>
            </li>
          );
        })}
      </ol>
      {todayShown ? (
        <p className="hidden text-xs leading-4 text-muted-foreground md:block">
          <span
            aria-hidden
            className="me-1.5 inline-block h-3 w-px translate-y-0.5 bg-primary/70"
          />
          {m.yearMapToday()}
        </p>
      ) : null}
      {dating.unit ? (
        <DatesSheet
          key={dating.key}
          classId={map.classId}
          year={year}
          unit={dating.unit}
          suggested={
            lastEnd && nextDay(lastEnd) < year.endsBefore
              ? nextDay(lastEnd)
              : today >= year.startsOn && today < year.endsBefore
                ? today
                : year.startsOn
          }
          onClose={() => setDating((current) => ({ ...current, unit: null }))}
        />
      ) : null}
    </section>
  );
}

/** Two weeks of school days, as a first guess at a unit's length. */
const TWO_WEEKS = 13 * DAY_MS;

interface DatesSheetProps {
  classId: string;
  year: { startsOn: string; endsBefore: string };
  unit: Unit;
  /** Where a unit with no dates yet starts: after the last one placed. */
  suggested: string;
  onClose: () => void;
}

function DatesSheet({
  classId,
  year,
  unit,
  suggested,
  onClose,
}: DatesSheetProps) {
  const queryClient = useQueryClient();
  const lastDay = isoOf(dayOf(year.endsBefore) - DAY_MS);
  const [startsOn, setStartsOn] = useState(unit.startsOn ?? suggested);
  const [endsOn, setEndsOn] = useState(
    unit.endsOn ??
      (isoOf(dayOf(suggested) + TWO_WEEKS) < year.endsBefore
        ? isoOf(dayOf(suggested) + TWO_WEEKS)
        : lastDay),
  );
  const [shown, setShown] = useState(false);
  const save = useMutation({
    mutationFn: (days: { startsOn: string; endsOn: string }) =>
      setUnitDates({ data: { moduleId: unit.id, classId, ...days } }),
    onSuccess: async (_, days) => {
      await queryClient.invalidateQueries({ queryKey: ["learning", "units"] });
      toast.success(days.startsOn ? m.yearMapSaved() : m.yearMapCleared());
      onClose();
    },
  });
  const missing = !startsOn || !endsOn;
  const backwards = !missing && endsOn < startsOn;
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={m.yearMapDatesTitle({ title: unit.title })}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={() => {
        setShown(true);
        if (!missing && !backwards) save.mutate({ startsOn, endsOn });
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.yearMapDatesHint()}
      </p>
      <TextField
        id="unit-starts"
        label={m.yearMapStart()}
        type="date"
        width="date"
        min={year.startsOn}
        max={lastDay}
        value={startsOn}
        onChange={(event) => setStartsOn(event.target.value)}
        errors={shown && !startsOn ? [m.yearMapBothNeeded()] : []}
      />
      <TextField
        id="unit-ends"
        label={m.yearMapEnd()}
        type="date"
        width="date"
        min={startsOn || year.startsOn}
        max={lastDay}
        value={endsOn}
        onChange={(event) => setEndsOn(event.target.value)}
        errors={
          shown && !endsOn
            ? [m.yearMapBothNeeded()]
            : shown && backwards
              ? [m.yearMapEndBefore()]
              : []
        }
      />
      {unit.startsOn ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ms-2 w-fit max-md:h-10"
          disabled={save.isPending}
          onClick={() => save.mutate({ startsOn: "", endsOn: "" })}
        >
          {m.yearMapClear()}
        </Button>
      ) : null}
    </SheetForm>
  );
}
