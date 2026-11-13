import { CalendarCheck } from "lucide-react";

import type { ModuleFillings } from "~/utils/extension";

import { schoolSettingsSections } from "~/components/admin/slots";
import { navItems } from "~/components/app/navigation";
import {
  classEditorParts,
  classFilters,
  classHistoryNotes,
  classRecordParts,
  listWords,
} from "~/components/classes/slots";
import {
  familyChildParts,
  learnerCards,
  officeCards,
  setupItemWords,
  setupStepWords,
} from "~/components/home/slots";
import { STATUS_LABEL, STATUS_TONE } from "~/components/people/format";
import {
  leavingParts,
  studentFilters,
  studentRecordParts,
} from "~/components/people/slots";
import { dayPlannerParts } from "~/components/school-days/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { askingQuery } from "~/queries/rollover";
import {
  classYearPartQuery,
  classYearQuery,
  placementsQuery,
  studentClassYearsQuery,
  yearEndQuery,
  yearOptionsQuery,
} from "~/queries/years";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";
import { replaceWords } from "~/utils/words";

import type { ClassYearRead } from "./YearParts";

import { yearDayPart } from "./DayParts";
import { YEARS_NOTICES } from "./notices";
import {
  ExitLabel,
  StudentYearAside,
  StudentYearHistory,
  StudentYearOverview,
} from "./StudentYears";
import {
  ClassYearField,
  daysOfYear,
  LearnerNextYear,
  LeavingYearFields,
  NextYear,
  WorkingYearSection,
  YearEndCard,
  yearEndAccess,
  yearFacet,
} from "./YearParts";

type Options = Awaited<
  ReturnType<NonNullable<(typeof yearOptionsQuery)["queryFn"]>>
>;
type ClassYear = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classYearQuery>["queryFn"]>>
>;
type Placements = Awaited<
  ReturnType<NonNullable<ReturnType<typeof placementsQuery>["queryFn"]>>
>;
type YearEnd = Awaited<
  ReturnType<NonNullable<(typeof yearEndQuery)["queryFn"]>>
>;
type StudentClassYears = Awaited<
  ReturnType<NonNullable<ReturnType<typeof studentClassYearsQuery>["queryFn"]>>
>;
type Asking = Awaited<ReturnType<NonNullable<(typeof askingQuery)["queryFn"]>>>;

/** What school years show across the portal, wherever a page has a place for it. */
export const SCHOOL_YEARS: ModuleFillings = {
  module: "school_years",
  fillings: [
    YEARS_NOTICES,
    fill(listWords, {
      list: "classes",
      title: m.classesEmptyTitle,
      body: m.classesEmptyBody,
      caption: m.classesAllCaption,
    }),
    fill(listWords, { list: "classesTaught", caption: m.classesTaughtCaption }),
    fill(setupStepWords, {
      id: "year",
      title: m.setupYearTitle,
      body: m.setupYearBody,
      capability: "years:manage",
      link: { to: "/academic-years", search: {} },
    }),
    fill(setupItemWords, { item: "year_ready", label: m.onboardingYearReady }),
    fill(modulePages, [
      "/academic-years",
      "/academic-year-editor",
      "/rollover",
      "/years",
    ]),
    fill(navItems, {
      workspace: "staff",
      section: "school",
      item: {
        to: "/academic-years",
        label: m.navSchoolYear,
        icon: CalendarCheck,
        capability: ["years:manage", "school:manage"],
        more: true,
        place: 40,
      },
    }),
    fill(dayPlannerParts, yearDayPart),
    fill(classFilters, {
      key: "year",
      narrows: (value) => value !== "all",
      query: () => yearOptionsQuery,
      facetOf: (read, value, onChange) =>
        yearFacet(read as Options, value, onChange, m.classesEveryClass()),
    }),
    fill(classEditorParts, {
      key: "year",
      section: "days",
      query: (classId) => classYearPartQuery(classId),
      initial: (read, search) => {
        const { options, linked } = read as ClassYearRead;
        if (linked) return { value: { yearId: linked.id } };
        const asked = typeof search.year === "string" ? search.year : "";
        const year =
          options.years.find((row) => row.id === asked) ??
          (asked === "all"
            ? undefined
            : options.years.find((row) => row.id === options.workingYearId));
        return year
          ? { value: { yearId: year.id }, days: daysOfYear(year) }
          : { value: { yearId: "" } };
      },
      Field: ClassYearField,
    }),
    fill(classRecordParts, {
      query: (classId) => classYearQuery(classId),
      partOf: (read) => {
        const { year } = read as ClassYear;
        if (!year) return null;
        return {
          facts: [
            {
              label: m.studentSchoolYear(),
              value: inLocale(year.titleEn, year.titleAr),
            },
          ],
          ...(year.lifecycle === "closed"
            ? {
                status: {
                  label: m.classesYearClosed(),
                  tone: "neutral" as const,
                },
              }
            : {}),
        };
      },
    }),
    fill(classHistoryNotes, {
      query: (studentId) => studentClassYearsQuery(studentId),
      noteOf: (read, classId) => {
        const year = (read as StudentClassYears).classes.find(
          (row) => row.classId === classId,
        );
        return year ? inLocale(year.titleEn, year.titleAr) : null;
      },
    }),
    fill(studentFilters, {
      key: "year",
      query: () => yearOptionsQuery,
      facetOf: (read, value, onChange) =>
        yearFacet(read as Options, value, onChange, m.studentsEveryStudent()),
      statuses: ["graduated", "unplaced"],
    }),
    fill(studentRecordParts, {
      query: (studentId) => placementsQuery(studentId),
      partOf: (read) => {
        const placements = read as Placements;
        const [latest] = placements.placements;
        return {
          facts: [],
          status: {
            label: STATUS_LABEL[placements.status](),
            tone: STATUS_TONE[placements.status],
          },
          departure: latest?.exitTypeId
            ? [
                {
                  label: m.leaveReason(),
                  value: <ExitLabel id={latest.exitTypeId} />,
                },
                {
                  label: m.leaveDestination(),
                  value: latest.destinationSchool ? (
                    <span dir="auto">{latest.destinationSchool}</span>
                  ) : null,
                },
              ]
            : [],
          Overview: StudentYearOverview,
          Enrolment: StudentYearHistory,
          EnrolmentAside: StudentYearAside,
        };
      },
    }),
    fill(leavingParts, {
      key: "year",
      query: () => yearOptionsQuery,
      initial: () => ({ exitTypeId: "", destination: "" }),
      problem: (value) =>
        (value as { exitTypeId?: string } | undefined)?.exitTypeId
          ? null
          : m.validationSelection(),
      Fields: LeavingYearFields,
      access: (read, lastDay, words) =>
        yearEndAccess(read as Options, lastDay, words),
    }),
    fill(officeCards, {
      query: (capabilities) =>
        capabilities.includes("years:manage") ? yearEndQuery : null,
      cardOf: (read) => {
        const data = read as YearEnd;
        return data ? <YearEndCard key="year-end" data={data} /> : null;
      },
    }),
    fill(familyChildParts, {
      query: (capabilities) =>
        capabilities.includes("children:read") ? askingQuery : null,
      partOf: (read, child) => {
        const asked = (read as Asking).find(
          (row) => row.studentId === child.studentId,
        );
        return asked ? <NextYear child={child} nextYear={asked} /> : null;
      },
    }),
    fill(learnerCards, {
      key: "next-year",
      place: 5,
      area: "main",
      query: () => askingQuery,
      cardOf: (read) => (
        <LearnerNextYear key="next-year" asked={read as Asking} />
      ),
    }),
    fill(schoolSettingsSections, {
      key: "working-year",
      query: () => yearOptionsQuery,
      Section: WorkingYearSection,
    }),
    replaceWords(m.leaveUndoBodyCore, m.leaveUndoBody),
    replaceWords(m.personNoTeachingCore, m.personNoTeaching),
    replaceWords(m.profileTeachesYouNoneCore, m.profileTeachesYouNone),
    replaceWords(m.profileTeachesChildNoneCore, m.profileTeachesChildNone),
    replaceWords(m.attStudentHintCore, m.attStudentHint),
    replaceWords(m.attRegistersTakenCore, m.attRegistersTaken),
    replaceWords(m.attFamilyHintCore, m.attFamilyHint),
    replaceWords(m.fupSupportHintCore, m.fupSupportHint),
    replaceWords(m.fupNoSupportCore, m.fupNoSupport),
    replaceWords(m.gradebookCaptionCore, m.gradebookCaption),
    replaceWords(m.gradesFamilyHintCore, m.gradesFamilyHint),
    replaceWords(m.gradesHintCore, m.gradesHint),
    replaceWords(m.gradingCategoriesHintCore, m.gradingCategoriesHint),
    replaceWords(m.courseworkCategoryHintCore, m.courseworkCategoryHint),
    replaceWords(m.readingCaptionCore, m.readingCaption),
    replaceWords(m.courseworkFamilyEarlierCore, m.courseworkFamilyEarlier),
    replaceWords(m.curriculumMapHintCore, m.curriculumMapHint),
    replaceWords(m.curriculumMapSummaryCore, m.curriculumMapSummary),
    replaceWords(
      m.curriculumMapNoFrameworksBodyCore,
      m.curriculumMapNoFrameworksBody,
    ),
    replaceWords(m.curriculumMapNoUnitsCore, m.curriculumMapNoUnits),
    replaceWords(m.curriculumMapNoUnitsBodyCore, m.curriculumMapNoUnitsBody),
  ],
};
