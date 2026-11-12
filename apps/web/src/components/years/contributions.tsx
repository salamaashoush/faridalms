import type { ModuleFillings } from "~/utils/extension";

import { schoolSettingsSections } from "~/components/admin/slots";
import {
  classEditorParts,
  classFilters,
  classHistoryNotes,
  classRecordParts,
} from "~/components/classes/slots";
import { familyChildParts, officeCards } from "~/components/home/slots";
import { STATUS_LABEL, STATUS_TONE } from "~/components/people/format";
import {
  leavingParts,
  studentEditorParts,
  studentFilters,
  studentRecordParts,
} from "~/components/people/slots";
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

import type { ClassYearRead } from "./YearParts";

import {
  ExitLabel,
  PlacedGradeLabel,
  StudentYearAside,
  StudentYearField,
  StudentYearHistory,
  StudentYearOverview,
} from "./StudentYears";
import {
  ClassYearField,
  daysOfYear,
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
    fill(classFilters, {
      key: "year",
      narrows: (value) => value !== "all",
      query: () => yearOptionsQuery,
      facetOf: (read, value, onChange) =>
        yearFacet(read as Options, value, onChange, m.classesEveryClass()),
    }),
    fill(classEditorParts, {
      key: "year",
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
      givesGrades: true,
      statuses: ["graduated", "unplaced"],
    }),
    fill(studentRecordParts, {
      query: (studentId) => placementsQuery(studentId),
      partOf: (read) => {
        const placements = read as Placements;
        const [latest] = placements.placements;
        return {
          facts: placements.current
            ? [
                {
                  label: m.studentGrade(),
                  value: <PlacedGradeLabel placements={placements} />,
                },
              ]
            : [],
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
    fill(studentEditorParts, {
      key: "year",
      title: m.studentTabEnrollment,
      query: () => yearOptionsQuery,
      initial: () => ({ gradeId: "" }),
      Field: StudentYearField,
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
      access: (read, lastDay) => yearEndAccess(read as Options, lastDay),
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
    fill(schoolSettingsSections, {
      key: "working-year",
      query: () => yearOptionsQuery,
      Section: WorkingYearSection,
    }),
  ],
};
