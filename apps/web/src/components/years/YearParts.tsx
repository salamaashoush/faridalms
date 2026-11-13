import type { NextYearIntention } from "@faridalms/domain/rollover";
import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { NEXT_YEAR_INTENTIONS } from "@faridalms/domain/rollover";
import { nextYearBegins } from "@faridalms/domain/years";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { Fact, Facts } from "@faridalms/ui/system/record-page";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import { StatusText } from "@faridalms/ui/system/status";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import type {
  ClassEditorPartProps,
  ViewValue,
} from "~/components/classes/slots";
import type { FamilyChild } from "~/components/home/slots";
import type { LeavingFieldsProps } from "~/components/people/slots";
import type { yearEndQuery } from "~/queries/years";
import type { InWords } from "~/utils/words";

import { HomeCard, HomeItem, HomeList } from "~/components/home/parts";
import { displayName, labelOf, lastDay } from "~/components/people/format";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { yearOptionsQuery } from "~/queries/years";
import { setIntention } from "~/server/rollover";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

type Options = Awaited<
  ReturnType<NonNullable<(typeof yearOptionsQuery)["queryFn"]>>
>;
type Year = Options["years"][number];

/** The year a class form starts from, as the class module's part reads it. */
export interface ClassYearRead {
  options: Options;
  /** The year the class belongs to, for one being changed. */
  linked: Year | null;
}

/** The value of the class form's year part. */
export interface ClassYearValue {
  yearId: string;
}

export const daysOfYear = (year: Year) => ({
  startsOn: year.startsOn,
  endsOn: lastDay(year.endsBefore),
});

/**
 * The year facet of a list: the working year unless another is chosen, and
 * every class or student whatever their year as `all`.
 */
export function yearFacet(
  options: Options,
  value: ViewValue,
  onChange: (value: ViewValue) => void,
  every: string,
): Facet | null {
  if (options.years.length === 0) return null;
  const working = options.workingYearId ?? "all";
  const chosen = typeof value === "string" ? value : undefined;
  return {
    id: "year",
    label: m.workingYear(),
    single: true,
    options: [
      ...options.years.map((row) => ({
        value: row.id,
        label: inLocale(row.titleEn, row.titleAr),
        hint:
          row.id === options.workingYearId
            ? m.workingYearDefaultHint()
            : row.lifecycle === "closed"
              ? m.classesYearClosed()
              : undefined,
      })),
      { value: "all", label: every },
    ],
    selected: [chosen ?? working],
    defaultSelected: [working],
    onChange: ([next]) => onChange(next === working ? undefined : next),
  };
}

/**
 * The year a class belongs to, on the class form: choosing one sets the
 * class's days to the year's, which may then be narrowed inside it.
 */
export function ClassYearField({
  read,
  value,
  onChange,
}: ClassEditorPartProps) {
  const { options, linked } = read as ClassYearRead;
  const chosen = (value as ClassYearValue | undefined)?.yearId ?? "";
  const open = options.years.filter(
    (row) => row.lifecycle !== "closed" || row.id === linked?.id,
  );
  return (
    <SelectField
      id="class-year"
      label={m.studentSchoolYear()}
      hint={m.classesYearHint()}
      value={chosen || "none"}
      options={[
        ...open.map((row) => ({
          value: row.id,
          label: inLocale(row.titleEn, row.titleAr),
        })),
        { value: "none", label: m.classesNoYear() },
      ]}
      onChange={(next) => {
        const year = options.years.find((row) => row.id === next);
        onChange(
          { yearId: year?.id ?? "" },
          year ? daysOfYear(year) : undefined,
        );
      }}
      width="name"
    />
  );
}

/** Why a student left and where they went, on the leaving sheet. */
export function LeavingYearFields({
  read,
  value,
  onChange,
  problem,
}: LeavingFieldsProps) {
  const options = read as Options;
  const words = useWords();
  const current = (value ?? { exitTypeId: "", destination: "" }) as {
    exitTypeId: string;
    destination: string;
  };
  return (
    <>
      <SelectField
        id="leave-reason"
        label={m.leaveReason()}
        value={current.exitTypeId}
        options={options.exitTypes.map((row) => ({
          value: row.id,
          label: labelOf(row) ?? row.code,
        }))}
        onChange={(exitTypeId) => onChange({ ...current, exitTypeId })}
        errors={problem ? [problem] : undefined}
        width="name"
      />
      <TextField
        id="leave-destination"
        label={m.leaveDestination()}
        hint={words(m.leaveDestinationHintCore)()}
        optional
        width="name"
        maxLength={160}
        value={current.destination}
        onChange={(event) =>
          onChange({ ...current, destination: event.target.value })
        }
      />
    </>
  );
}

/** The leaver's reading of the record kept to the next year, from the year their last day falls in. */
export function yearEndAccess(
  options: Options,
  lastDayAt: string,
  words: InWords,
) {
  const year = options.years.find(
    (row) => row.startsOn <= lastDayAt && lastDayAt < row.endsBefore,
  );
  if (!year) return [];
  const until = lastDay(nextYearBegins(options.years, year));
  return [
    {
      value: "year_end",
      label: m.leaveAccessYearEnd(),
      hint: words(m.leaveAccessYearEndHintCore)({ date: formatDate(until) }),
      until,
    },
  ];
}

interface YearEndCardProps {
  data: NonNullable<
    Awaited<ReturnType<NonNullable<(typeof yearEndQuery)["queryFn"]>>>
  >;
}

/** The next year's setup on the office's day, once this one nears its end. */
export function YearEndCard({ data }: YearEndCardProps) {
  const items = [
    { title: m.homeChecklistYear(), done: data.nextYear },
    { title: m.homeChecklistClasses(), done: data.nextClasses > 0 },
    { title: m.homeChecklistStudents(), done: data.nextStudents > 0 },
  ];
  return (
    <HomeCard
      title={m.homeNextYear()}
      description={m.homeYearEnds({ date: formatDate(data.yearEnds) })}
      action={{
        label: m.homeOpenYears(),
        link: { to: "/academic-years", search: {} },
      }}
    >
      <HomeList>
        {items.map((item) => (
          <HomeItem
            key={item.title}
            title={<span className="text-sm">{item.title}</span>}
            status={
              <StatusText tone={item.done ? "success" : "warning"}>
                {item.done ? m.homeDone() : m.homeToDo()}
              </StatusText>
            }
          />
        ))}
      </HomeList>
    </HomeCard>
  );
}

const INTENTION_LABEL = {
  returning: m.familyNextYearReturning,
  undecided: m.familyNextYearUndecided,
  leaving: m.familyNextYearLeaving,
} satisfies Record<NextYearIntention, () => string>;

interface NextYearProps {
  child: FamilyChild;
  nextYear: {
    intention: NextYearIntention | null;
    titleEn: string | null;
    titleAr: string | null;
  };
  /** The learner answers for themself. */
  own?: boolean;
}

/**
 * The school's question about a learner's next year, for whoever decides
 * for them, a guardian or the learner themself: each choice is kept as it
 * is made, and can change while the school is asking. Where both decide,
 * the latest answer stands and the learner's history keeps each.
 */
export function NextYear({ child, nextYear, own = false }: NextYearProps) {
  const save = useServerFn(setIntention);
  const [chosen, setChosen] = useState(nextYear.intention);
  const answer = useMutation({
    mutationFn: (intention: NextYearIntention) =>
      save({ data: { studentId: child.studentId, intention } }),
    meta: { inlineError: true },
  });
  const year = inLocale(nextYear.titleEn, nextYear.titleAr);
  const legend = own
    ? m.learnerNextYearTitle({ year })
    : m.familyNextYearTitle({ name: displayName(child), year });
  return (
    <fieldset className={own ? "grid gap-2" : "grid gap-2 border-t pt-4"}>
      <legend className="float-start mb-1 text-sm font-semibold">
        <bdi>{legend}</bdi>
      </legend>
      <RadioGroup
        value={chosen ?? ""}
        onValueChange={(value) => {
          const intention = NEXT_YEAR_INTENTIONS.find((item) => item === value);
          if (!intention) return;
          setChosen(intention);
          answer.mutate(intention);
        }}
        className="grid gap-1"
      >
        {NEXT_YEAR_INTENTIONS.map((intention) => (
          <label
            key={intention}
            className="flex min-h-8 items-center gap-3 text-sm leading-5 max-md:min-h-10"
          >
            <RadioGroupItem value={intention} disabled={answer.isPending} />
            {INTENTION_LABEL[intention]()}
          </label>
        ))}
      </RadioGroup>
      {answer.error ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {getMessageFromError(answer.error)}
        </p>
      ) : (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {chosen ? m.familyNextYearKept() : m.familyNextYearHint()}
        </p>
      )}
    </fieldset>
  );
}

interface LearnerNextYearProps {
  asked: readonly {
    studentId: string;
    intention: NextYearIntention | null;
    titleEn: string | null;
    titleAr: string | null;
  }[];
}

/** The school's question about next year on the Today of a learner who decides for themself. */
export function LearnerNextYear({ asked }: LearnerNextYearProps) {
  const user = useCurrentUser();
  const own = asked.find((row) => row.studentId === user.id);
  if (!own) return null;
  return (
    <HomeCard title={m.learnerNextYearCard()}>
      <NextYear
        own
        child={{
          studentId: user.id,
          fullNameEn: user.nameEn,
          fullNameAr: user.nameAr,
        }}
        nextYear={own}
      />
    </HomeCard>
  );
}

/** The year the school works in, on its settings, with where years are kept. */
export function WorkingYearSection() {
  const options = useSuspenseQuery(yearOptionsQuery).data;
  const year = options.years.find((row) => row.id === options.workingYearId);
  return (
    <SettingsSection
      title={m.settingsWorkingYear()}
      description={m.settingsWorkingYearHint()}
      footer={
        <ButtonLink
          to="/academic-years"
          variant="outline"
          className="max-md:h-10"
        >
          {m.academicYearsManage()}
        </ButtonLink>
      }
    >
      {year ? (
        <Facts short>
          <Fact label={m.academicYearName()}>
            {inLocale(year.titleEn, year.titleAr)}
          </Fact>
          <Fact label={m.adminStartsOn()}>{formatDate(year.startsOn)}</Fact>
          <Fact label={m.adminEndsOn()}>
            {formatDate(lastDay(year.endsBefore))}
          </Fact>
        </Facts>
      ) : (
        <EmptyState placement="section" title={m.settingsNoWorkingYear()} />
      )}
    </SettingsSection>
  );
}
