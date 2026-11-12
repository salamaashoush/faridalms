import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { TextField } from "@faridalms/ui/system/form-field";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import type {
  DayPlannerPart,
  PlannerAsideProps,
} from "~/components/school-days/slots";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { yearsInSpanQuery } from "~/queries/years";
import { setYearTarget } from "~/server/years";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Read = Awaited<
  ReturnType<NonNullable<ReturnType<typeof yearsInSpanQuery>["queryFn"]>>
>;
type Year = Read["years"][number];

const asRead = (read: unknown) => read as Read;

const yearOn = (read: Read, day: string) =>
  read.years.find((year) => year.startsOn <= day && day < year.endsBefore);

interface TargetProps {
  year: Year;
  /** More than one year shows, so each card names its year. */
  named: boolean;
  canEdit: boolean;
}

/** A year's school days counted against the target its authority sets. */
function Target({ year, named, canEdit }: TargetProps) {
  const queryClient = useQueryClient();
  const target = year.targetDays;
  const [value, setValue] = useState(target ? String(target) : "");
  const save = useMutation({
    mutationFn: () =>
      setYearTarget({
        data: { yearId: year.id, target: value.trim() ? Number(value) : null },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["years"] });
      toast.success(m.plannerTargetSaved());
    },
  });
  const count = year.schoolDays;
  const gap = target ? count - target : null;
  return (
    <div className="grid gap-3 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        {named
          ? m.plannerSchoolDaysOf({
              year: inLocale(year.titleEn, year.titleAr),
            })
          : m.plannerSchoolDays()}
      </p>
      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">
          {formatNumber(count)}
        </span>
        {target ? (
          <span className="text-sm text-muted-foreground">
            {m.plannerOfTarget({ target: formatNumber(target) })}
          </span>
        ) : null}
      </p>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.plannerClosedCount({ count: formatNumber(year.closedDays) })}
      </p>
      {gap !== null && gap !== 0 ? (
        <p
          className={cn(
            "text-[13px] leading-[18px]",
            gap < 0 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {gap < 0
            ? m.plannerShort({ count: formatNumber(-gap) })
            : m.plannerOver({ count: formatNumber(gap) })}
        </p>
      ) : null}
      {canEdit && !year.closed ? (
        <form
          className="flex items-end gap-2 print:hidden"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <TextField
            id={`planner-target-${year.id}`}
            label={m.plannerTarget()}
            type="number"
            min={1}
            max={366}
            width="date"
            inputMode="numeric"
            dir="ltr"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            errors={save.error ? [getMessageFromError(save.error)] : undefined}
          />
          <Button
            type="submit"
            variant="outline"
            className="max-md:h-10"
            disabled={save.isPending}
          >
            {m.commonSave()}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function YearsAside({ read: raw, canEdit }: PlannerAsideProps) {
  const read = asRead(raw);
  return (
    <>
      {read.years.map((year) => (
        <Target
          key={year.id}
          year={year}
          named={read.years.length > 1}
          canEdit={canEdit && read.canEdit}
        />
      ))}
    </>
  );
}

/** What school years add to the school's days: each day's term, and each year's count against its target. */
export const yearDayPart: DayPlannerPart = {
  key: "school_years",
  query: (from, to) => yearsInSpanQuery(from, to),
  dayOf: (raw, day) => {
    const year = yearOn(asRead(raw), day.day);
    if (!year) return null;
    const term = year.terms.find(
      (row) => row.startsOn <= day.day && day.day < row.endsBefore,
    );
    return {
      words: [
        term ? inLocale(term.titleEn, term.titleAr) : m.plannerBetweenTerms(),
      ],
      outside: !term,
    };
  },
  legend: (raw) =>
    asRead(raw).years.length > 0
      ? [
          {
            key: "between-terms",
            swatch: (
              <span
                aria-hidden
                className="size-3.5 rounded-sm border border-dotted border-muted-foreground/60"
              />
            ),
            label: m.plannerBetweenTerms(),
          },
        ]
      : [],
  Aside: YearsAside,
};
