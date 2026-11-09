import type { HeaderFact, RecordTab } from "@faridalms/ui/system/record-page";

import { cn } from "@faridalms/ui/cn";
import { Page } from "@faridalms/ui/system/page";
import {
  Fact,
  Facts,
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
  RecordTabs,
} from "@faridalms/ui/system/record-page";
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Pencil } from "lucide-react";

import { HistoryFeed } from "~/components/people/record-parts";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { yearHistoryQuery, yearQuery, yearsQuery } from "~/queries/years";
import { formatNumber } from "~/utils/datetime";

import { STANDING_LABEL, STANDING_TONE, yearDates, yearTitle } from "./format";
import {
  lifecycleActions,
  rolloverActions,
  useYearLifecycle,
} from "./YearLifecycle";
import { YearPeriods } from "./YearPeriods";
import { YearPlanner } from "./YearPlanner";

export const YEAR_TABS = ["overview", "days", "periods", "history"] as const;
export type YearTab = (typeof YEAR_TABS)[number];

const TAB_LABEL: Record<YearTab, () => string> = {
  overview: m.recordOverview,
  days: m.plannerTab,
  periods: m.periodsTab,
  history: m.recordHistory,
};

type YearData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof yearQuery>["queryFn"]>>
>;

interface TermsSectionProps {
  year: YearData;
}

function TermsSection({ year }: TermsSectionProps) {
  return (
    <RecordSection title={m.yearsTerms()} description={m.yearsTermsHint()}>
      {year.terms.length === 0 ? (
        <RecordEmpty>{m.yearsNoTerms()}</RecordEmpty>
      ) : (
        <RecordList>
          {year.terms.map((term) => (
            <li
              key={term.id}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
            >
              <span dir="auto" className="text-sm leading-5 font-medium">
                {inLocale(term.titleEn, term.titleAr)}
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {yearDates(term)}
              </span>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

interface CountLinkProps {
  to: "/classes" | "/students";
  year: string;
  children: number;
}

function CountLink({ to, year, children }: CountLinkProps) {
  return (
    <Link
      to={to}
      search={{ year }}
      className={cn("text-primary tabular-nums hover:underline", phoneLink)}
    >
      {formatNumber(children)}
    </Link>
  );
}

interface SummarySectionProps {
  year: YearData;
}

function SummarySection({ year }: SummarySectionProps) {
  return (
    <RecordSection title={m.yearsSummary()}>
      <Facts>
        <Fact label={m.adminClassesTitle()}>
          <CountLink to="/classes" year={year.id}>
            {year.classes}
          </CountLink>
        </Fact>
        <Fact label={m.classesStudents()}>
          <CountLink to="/students" year={year.id}>
            {year.students}
          </CountLink>
        </Fact>
        <Fact label={m.yearsWeeks()}>
          <span className="tabular-nums">
            {formatNumber(year.calendar.weeks)}
          </span>
        </Fact>
        <Fact label={m.yearsSchoolDays()}>
          <span className="tabular-nums">
            {formatNumber(year.calendar.schoolDays)}
          </span>
        </Fact>
      </Facts>
    </RecordSection>
  );
}

interface YearHistoryProps {
  yearId: string;
}

function YearHistory({ yearId }: YearHistoryProps) {
  const feed = useSuspenseInfiniteQuery(yearHistoryQuery(yearId));
  return <HistoryFeed feed={feed} />;
}

export interface YearRecordProps {
  yearId: string;
  tab: YearTab;
  /** The day the periods tab reads the school day on; empty for today. */
  on: string;
  onTab: (tab: YearTab) => void;
}

export function YearRecord({ yearId, tab, on, onTab }: YearRecordProps) {
  const year = useSuspenseQuery(yearQuery(yearId)).data;
  const years = useSuspenseQuery(yearsQuery).data.years;
  const navigate = useNavigate();
  const current = years.find((row) => row.lifecycle === "current") ?? null;
  const lifecycle = useYearLifecycle(current);
  const title = yearTitle(year);
  const facts: HeaderFact[] = [
    { label: m.yearsDates(), value: yearDates(year) },
  ];
  const tabs: RecordTab<YearTab>[] = YEAR_TABS.map((value) => ({
    value,
    label: TAB_LABEL[value](),
  }));
  return (
    <Page width="record">
      <RecordHeader
        title={title}
        facts={facts}
        status={{
          label: STANDING_LABEL[year.standing](),
          tone: STANDING_TONE[year.standing],
        }}
        action={
          year.access.manage && year.lifecycle !== "closed"
            ? {
                label: m.yearsEdit(),
                icon: Pencil,
                onClick: () =>
                  void navigate({
                    to: "/academic-year-editor",
                    search: { id: year.id },
                  }),
              }
            : undefined
        }
        menu={[
          ...rolloverActions(
            year,
            current,
            year.access,
            (source, target) =>
              void navigate({
                to: "/rollover",
                search: { source, target },
              }),
          ),
          ...lifecycleActions(year, year.access, lifecycle.open),
        ]}
      />
      <RecordTabs
        label={m.yearsSections()}
        tabs={tabs}
        value={tab}
        onChange={onTab}
      >
        {tab === "history" ? (
          <RecordColumns main={<YearHistory yearId={year.id} />} />
        ) : tab === "periods" ? (
          <YearPeriods yearId={year.id} on={on} />
        ) : tab === "days" ? (
          <YearPlanner
            yearId={year.id}
            startsOn={year.startsOn}
            endsBefore={year.endsBefore}
          />
        ) : (
          <RecordColumns
            main={<TermsSection year={year} />}
            aside={<SummarySection year={year} />}
          />
        )}
      </RecordTabs>
      {lifecycle.sheet}
    </Page>
  );
}
