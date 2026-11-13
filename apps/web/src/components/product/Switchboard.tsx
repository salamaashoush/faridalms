import { cn } from "@faridalms/ui/cn";
import { useState } from "react";

import * as m from "~/i18n/messages";

type Switch =
  | "coursework"
  | "elearning"
  | "attendance"
  | "gradebook"
  | "coding"
  | "video"
  | "years"
  | "grades"
  | "homerooms"
  | "timetable"
  | "families"
  | "website"
  | "admissions";

const LABEL: Record<Switch, () => string> = {
  coursework: m.moduleCoursework,
  elearning: m.moduleElearning,
  attendance: m.moduleAttendance,
  gradebook: m.moduleGradebook,
  coding: m.moduleCoding,
  video: m.moduleVideo,
  years: m.moduleSchoolYears,
  grades: m.moduleGradeLevels,
  homerooms: m.moduleHomerooms,
  timetable: m.moduleTimetable,
  families: m.moduleFamilies,
  website: m.moduleWebsite,
  admissions: m.moduleAdmissions,
};

const GROUPS: { title: () => string; switches: Switch[] }[] = [
  {
    title: m.productFitGroupTeaching,
    switches: [
      "coursework",
      "elearning",
      "attendance",
      "gradebook",
      "coding",
      "video",
    ],
  },
  {
    title: m.productFitGroupOrganised,
    switches: ["years", "grades", "homerooms", "timetable", "families"],
  },
  { title: m.productFitGroupDoor, switches: ["website", "admissions"] },
];

/** Mixes to start from. They are examples: every switch stays free. */
const EXAMPLES: {
  id: string;
  label: () => string;
  school: () => string;
  on: Switch[];
}[] = [
  {
    id: "k12",
    label: m.productFitExampleSchool,
    school: m.productFitSchoolK12,
    on: [
      "coursework",
      "elearning",
      "attendance",
      "gradebook",
      "years",
      "grades",
      "homerooms",
      "timetable",
      "families",
      "website",
      "admissions",
    ],
  },
  {
    id: "code",
    label: m.productFitExampleCode,
    school: m.productFitSchoolCode,
    on: ["coursework", "elearning", "attendance", "coding", "grades"],
  },
  {
    id: "academy",
    label: m.productFitExampleAcademy,
    school: m.productFitSchoolAcademy,
    on: ["coursework", "elearning", "attendance", "admissions", "website"],
  },
  {
    id: "video",
    label: m.productFitExampleVideo,
    school: m.productFitSchoolVideo,
    on: ["elearning", "video", "coursework", "website"],
  },
  {
    id: "core",
    label: m.productFitExampleCore,
    school: m.productFitSchoolCore,
    on: [],
  },
];

/** A module another needs comes on with it, and takes it along when it goes. */
function flipped(on: ReadonlySet<Switch>, key: Switch): Set<Switch> {
  const next = new Set<Switch>(on);
  if (next.has(key)) {
    next.delete(key);
    if (key === "coursework") next.delete("gradebook");
    if (key === "elearning") next.delete("video");
  } else {
    next.add(key);
    if (key === "gradebook") next.add("coursework");
    if (key === "video") next.add("elearning");
  }
  return next;
}

interface StarProps {
  className?: string;
}

function Star({ className }: StarProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M12 2.1 14.9 5h4.1v4.1L21.9 12 19 14.9V19h-4.1L12 21.9 9.1 19H5v-4.1L2.1 12 5 9.1V5h4.1z" />
    </svg>
  );
}

interface FoldProps {
  shown: boolean;
  children: React.ReactNode;
  className?: string;
}

/** A row that closes to nothing when its module goes, so the page reflows. */
function Fold({ shown, children, className }: FoldProps) {
  return (
    <li
      aria-hidden={!shown}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none",
        shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className={cn("min-h-0 overflow-hidden", className)}>{children}</div>
    </li>
  );
}

/**
 * The product, drawn from the modules that are on. It is the page's argument
 * made by hand: the words are the product's own, so turning families off
 * shows the sentences a school without them reads.
 */
export function Switchboard() {
  const [on, setOn] = useState<ReadonlySet<Switch>>(
    () => new Set<Switch>(EXAMPLES[0]?.on),
  );
  const [example, setExample] = useState<string | null>("k12");
  const has = (key: Switch) => on.has(key);
  const school =
    EXAMPLES.find((each) => each.id === example)?.school ??
    m.productFitSchoolCore;

  const nav: { group: () => string; links: [() => string, Switch | null][] }[] =
    [
      {
        group: m.navSectionTeaching,
        links: [
          [m.navClasses, null],
          [m.navToReview, "coursework"],
          [m.navCoursework, "coursework"],
          [m.navGradebook, "gradebook"],
          [m.navModules, "elearning"],
          [m.navAttendance, "attendance"],
          [m.navTimetable, "timetable"],
        ],
      },
      {
        group: m.navSectionPeople,
        links: [
          [m.navStudents, null],
          [m.navAdmissions, "admissions"],
          [m.navStaff, null],
        ],
      },
      {
        group: m.navSectionCommunication,
        links: [
          [m.navMessages, null],
          [m.navAnnouncements, null],
          [m.navCalendar, null],
        ],
      },
      {
        group: m.navSectionSchool,
        links: [
          [m.navSchoolYear, "years"],
          [m.navWebsite, "website"],
          [m.navSettings, null],
        ],
      },
    ];

  const families = has("families");
  const grades = has("grades");
  const schoolShaped = grades && has("years") && has("homerooms");
  const steps: {
    title: string;
    body: string;
    owner: string;
    shown: boolean;
  }[] = [
    {
      title: m.setupDetailsTitle(),
      body: families ? m.setupDetailsBody() : m.setupDetailsBodyCore(),
      owner: m.productFitCore(),
      shown: true,
    },
    {
      title: m.setupYearTitle(),
      body: m.setupYearBody(),
      owner: m.moduleSchoolYears(),
      shown: has("years"),
    },
    {
      title: schoolShaped ? m.setupClassesTitle() : m.setupClassesTitleCore(),
      body: schoolShaped ? m.setupClassesBody() : m.setupClassesBodyCore(),
      owner: m.productFitCore(),
      shown: true,
    },
    {
      title: m.setupStaffTitle(),
      body: m.setupStaffBody(),
      owner: m.productFitCore(),
      shown: true,
    },
    {
      title: families ? m.setupStudentsTitle() : m.setupStudentsTitleCore(),
      body: families ? m.setupStudentsBody() : m.setupStudentsBodyCore(),
      owner: m.productFitCore(),
      shown: true,
    },
    {
      title: m.setupTimetableTitle(),
      body: m.setupTimetableBody(),
      owner: m.moduleTimetable(),
      shown: has("timetable"),
    },
    {
      title: m.setupWebsiteTitle(),
      body: m.setupWebsiteBody(),
      owner: m.moduleWebsite(),
      shown: has("website"),
    },
    {
      title: m.setupAdmissionsTitle(),
      body:
        families && grades
          ? m.setupAdmissionsBody()
          : m.setupAdmissionsBodyCore(),
      owner: m.moduleAdmissions(),
      shown: has("admissions"),
    },
  ];
  const stepCount = steps.filter((step) => step.shown).length;
  const pages =
    9 +
    nav
      .flatMap((section) => section.links)
      .filter(([, needs]) => needs !== null && has(needs)).length;

  const students: [string, string, string, string, string][] = [
    [
      m.productFitStudent1(),
      "LF1001",
      m.productFitGrade8(),
      "8A",
      "+20 104 950 6771",
    ],
    [
      m.productFitStudent2(),
      "LF1002",
      m.productFitGrade7(),
      "7A",
      "+20 102 391 7963",
    ],
    [
      m.productFitStudent3(),
      "LF1003",
      m.productFitGrade9(),
      "9A",
      "+20 108 184 8944",
    ],
  ];
  const lesson: [() => string, boolean][] = [
    [m.productFitLessonText, true],
    [m.productFitLessonQuiz, has("coursework")],
    [m.productFitLessonCode, has("coding")],
    [m.productFitLessonVideo, has("video")],
  ];
  let step = 0;

  return (
    <div className="rounded-[1.4rem] bg-white/10 p-1.5 shadow-[0_40px_90px_-40px_color-mix(in_srgb,var(--brand-shadow)_70%,transparent)] ring-1 ring-white/15 sm:p-2.5">
      <div className="grid overflow-hidden rounded-2xl bg-background text-foreground lg:grid-cols-[21rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 border-b bg-muted/60 p-5 sm:p-6 lg:border-e lg:border-b-0">
          <div>
            <h2 id="fit-title" className="text-base font-semibold">
              {m.productFitTitle()}
            </h2>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">
              {m.productFitHint()}
            </p>
          </div>
          <fieldset className="flex min-w-0 flex-wrap gap-1.5">
            <legend className="sr-only">{m.productFitExamples()}</legend>
            {EXAMPLES.map((each) => (
              <button
                key={each.id}
                type="button"
                aria-pressed={example === each.id}
                onClick={() => {
                  setOn(new Set<Switch>(each.on));
                  setExample(each.id);
                }}
                className="rounded-full border bg-card px-3 py-1.5 text-[13px] font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white"
              >
                {each.label()}
              </button>
            ))}
          </fieldset>
          {GROUPS.map((group) => (
            <div key={group.title()}>
              <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase rtl:tracking-normal">
                {group.title()}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {group.switches.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={has(key)}
                    onClick={() => {
                      setOn(flipped(on, key));
                      setExample(null);
                    }}
                    className="group/switch flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-start text-[13px] leading-tight font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-primary/40 aria-pressed:bg-primary/10 aria-pressed:text-primary"
                  >
                    <Star className="size-4 shrink-0 text-muted-foreground/40 transition-transform duration-300 group-aria-pressed/switch:rotate-45 group-aria-pressed/switch:text-primary motion-reduce:transition-none" />
                    {LABEL[key]()}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <dl className="mt-auto grid grid-cols-3 gap-3 border-t pt-4 text-sm">
            {(
              [
                [m.productFitCountModules(), on.size],
                [m.productFitCountSteps(), stepCount],
                [m.productFitCountPages(), pages],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dd className="text-lg leading-none font-semibold tabular-nums">
                  {value}
                </dd>
                <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>
        </div>

        <div
          aria-live="polite"
          aria-label={m.productFitPreview()}
          className="grid min-w-0 text-[13px] md:grid-cols-[12.5rem_minmax(0,1fr)]"
        >
          <div className="hidden border-e bg-muted/30 p-3 md:block">
            <div className="flex items-center gap-2 px-1.5 pb-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand text-brand-accent">
                <Star className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] leading-tight font-semibold">
                  {school()}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {m.appName()}
                </span>
              </span>
            </div>
            <p className="rounded-md bg-muted px-2 py-1.5 font-semibold">
              {m.navToday()}
            </p>
            {nav.map((section) => (
              <div key={section.group()}>
                <p className="px-2 pt-3 pb-1 text-[11px] text-muted-foreground">
                  {section.group()}
                </p>
                <ul>
                  {section.links.map(([label, needs]) => (
                    <Fold
                      key={label()}
                      shown={needs === null || has(needs)}
                      className="px-2 text-foreground/80"
                    >
                      <span className="block py-1.5">{label()}</span>
                    </Fold>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="grid min-w-0 content-start gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-[15px] font-semibold">{m.navToday()}</p>
              <p className="text-muted-foreground">
                <span className="text-xs">{m.productFitSigns()} </span>
                <span className="font-medium text-foreground">
                  {families ? m.portalEyebrow() : m.portalEyebrowCore()}
                </span>
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-2">
                <p className="text-[15px] font-semibold">
                  {m.homeOnboarding()}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {m.productFitCountSteps()} · {stepCount}
                </p>
              </div>
              <ol>
                {steps.map((each) => {
                  if (each.shown) step += 1;
                  return (
                    <Fold key={each.owner + each.title} shown={each.shown}>
                      <div className="grid grid-cols-[1.4rem_minmax(0,1fr)_auto] items-start gap-3 border-t px-4 py-2.5">
                        <span className="grid size-5 place-items-center rounded-full border text-[11px] font-semibold text-primary tabular-nums">
                          {step}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold">
                            {each.title}
                          </span>
                          <span className="block text-xs text-pretty text-muted-foreground">
                            {each.body}
                          </span>
                        </span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] whitespace-nowrap text-primary">
                          {each.owner}
                        </span>
                      </div>
                    </Fold>
                  );
                })}
              </ol>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-start">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b [&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:font-medium [&>th]:whitespace-nowrap">
                    <th>{m.navStudents()}</th>
                    <th className={cn(schoolShaped && families && "hidden")}>
                      {m.adminReference()}
                    </th>
                    {grades ? <th>{m.studentGrade()}</th> : null}
                    {has("homerooms") ? <th>{m.homeroomWord()}</th> : null}
                    {families ? <th>{m.studentsGuardianPhone()}</th> : null}
                    <th>{m.studentStatus()}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(([name, reference, grade, homeroom, phone]) => (
                    <tr
                      key={reference}
                      className="border-b last:border-b-0 [&>td]:px-3 [&>td]:py-2 [&>td]:whitespace-nowrap"
                    >
                      <td className="font-medium">{name}</td>
                      <td
                        dir="ltr"
                        className={cn(
                          "text-start text-muted-foreground",
                          schoolShaped && families && "hidden",
                        )}
                      >
                        {reference}
                      </td>
                      {grades ? <td>{grade}</td> : null}
                      {has("homerooms") ? <td dir="ltr">{homeroom}</td> : null}
                      {families ? (
                        <td dir="ltr" className="text-start">
                          {phone}
                        </td>
                      ) : null}
                      <td>
                        <span className="me-1.5 inline-block size-1.5 rounded-full bg-success align-middle" />
                        {m.studentStatusEnrolled()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed bg-primary/5 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {m.productFitLesson()}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {lesson
                  .filter(([, shown]) => shown)
                  .map(([label]) => (
                    <li
                      key={label()}
                      className="rounded-full border bg-card px-2.5 py-1 text-xs font-medium"
                    >
                      {label()}
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
