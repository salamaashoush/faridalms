import { contentPlainText } from "@faridalms/domain/content";
import {
  headedContent,
  plainContent,
} from "@faridalms/domain/content-conversion";
import { CATALOGUE } from "@faridalms/domain/descriptors/catalogue";
import { normaliseIdentifier } from "@faridalms/domain/identifiers";
import { addDays, teachingWeeks } from "@faridalms/domain/school";
import {
  buildTemplate,
  STARTERS,
  starterChrome,
} from "@faridalms/domain/site-templates";
import { schoolDays } from "@faridalms/domain/timetable";
import { localizedSections, pagePlainText } from "@faridalms/domain/website";
import { and, eq, sql } from "drizzle-orm";

import type { CellTransaction, openOwner } from "./context";
import type { KeyEncryptionKey } from "./crypto";
import type { Audience } from "./stores/audiences";
import type { ProvisionedTenant, TenantSpec } from "./tenants";

import { withPurpose } from "./context";
import { encryptField, lookupHmac } from "./crypto";
import { newUserHandle } from "./stores/accounts";
import { addRecipients } from "./stores/announcements";
import { audienceUsers, setAudiences } from "./stores/audiences";
import { insertAnswer, insertForm, publishForm } from "./stores/consents";
import {
  saveDocument,
  saveTranslation,
  snapshotPublish,
} from "./stores/documents";
import {
  insertLesson,
  insertModule,
  recordProgress,
  setModuleClasses,
  setModuleState,
} from "./stores/learning";
import { addPostRecipients, insertPost, setPostState } from "./stores/news";
import { insertDeliveries, insertNotifications } from "./stores/notifications";
import { setOrgFeature } from "./stores/school";
import {
  insertEnquiry,
  insertPage,
  saveCategory,
  saveSiteSettings,
  setPageState,
  writePublishedPage,
  writePublishedPost,
} from "./stores/site";
import { reviewTranslation } from "./stores/translations";
import {
  academicSessions,
  academicWeeks,
  announcementAudiences,
  announcements,
  attendanceRegisters,
  assessments,
  assignmentRecipients,
  assignments,
  accessRoleAssignments,
  accessRoles,
  accounts,
  calendarDates,
  calendarEventAudiences,
  calendarEvents,
  calendars,
  classGroupMembers,
  classGroups,
  classes,
  classMeetings,
  classPeriods,
  contactPoints,
  courses,
  demographics,
  descriptors,
  documents,
  enrollments,
  externalIds,
  healthRecords,
  locations,
  loginIdentities,
  messages,
  messageThreads,
  orgs,
  periodGrades,
  rubrics,
  studentSchoolYears,
  submissionAttempts,
  submissions,
  tenantKeys,
  threadMembers,
  userRelationships,
  userRoles,
  users,
} from "./tables/index";
import { attendanceEvents } from "./tables/partitioned";
import { provisionTenant } from "./tenants";

/** A small deterministic generator, so every reset produces the same people. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Name = [en: string, ar: string];

const GIRLS: Name[] = [
  ["Mariam", "مريم"],
  ["Salma", "سلمى"],
  ["Nour", "نور"],
  ["Farida", "فريدة"],
  ["Hana", "هنا"],
  ["Laila", "ليلى"],
  ["Yasmin", "ياسمين"],
  ["Jana", "جنى"],
  ["Malak", "ملك"],
  ["Rana", "رنا"],
  ["Dina", "دينا"],
  ["Aya", "آية"],
];
const BOYS: Name[] = [
  ["Omar", "عمر"],
  ["Youssef", "يوسف"],
  ["Adam", "آدم"],
  ["Karim", "كريم"],
  ["Ali", "علي"],
  ["Hassan", "حسن"],
  ["Ziad", "زياد"],
  ["Mostafa", "مصطفى"],
  ["Tarek", "طارق"],
  ["Khaled", "خالد"],
  ["Seif", "سيف"],
  ["Hamza", "حمزة"],
];
const FAMILIES: Name[] = [
  ["Mansour", "منصور"],
  ["Hamdy", "حمدي"],
  ["Fathy", "فتحي"],
  ["Nasser", "ناصر"],
  ["Saleh", "صالح"],
  ["Farouk", "فاروق"],
  ["Rashad", "رشاد"],
  ["Zaki", "زكي"],
  ["Wahba", "وهبة"],
  ["Sabry", "صبري"],
  ["Helmy", "حلمي"],
  ["Kamel", "كامل"],
];
const MOTHERS: Name[] = [
  ["Amira", "أميرة"],
  ["Heba", "هبة"],
  ["Mona", "منى"],
  ["Rania", "رانيا"],
  ["Sara", "سارة"],
  ["Noha", "نهى"],
  ["Dalia", "داليا"],
  ["Ghada", "غادة"],
];

const DEV_PASSWORD = "farida-development-password";

export interface SeedOptions {
  kek: KeyEncryptionKey;
  cell: string;
  /** Today's date in the schools' zone, YYYY-MM-DD. */
  today?: string;
}

export interface SeededSchool {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
}

export interface SeededTenant extends ProvisionedTenant {
  spec: TenantSpec;
  schools: SeededSchool[];
  /** Login names by role, for tests and for signing in during development. */
  logins: { role: string; loginName: string; schoolId: string | null }[];
}

export const SEED_PASSWORD = DEV_PASSWORD;

type Tx = CellTransaction;

async function descriptorIds(tx: Tx, tenantId: string, namespace: string) {
  const rows = await tx
    .select({ id: descriptors.id, code: descriptors.codeValue })
    .from(descriptors)
    .where(
      and(
        eq(descriptors.tenantId, tenantId),
        eq(descriptors.namespace, namespace),
      ),
    );
  return new Map(rows.map((row) => [row.code, row.id]));
}

const need = <K, V>(map: Map<K, V>, key: K): V => {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Seed is missing ${String(key)}`);
  return value;
};

const isoWeekday = (day: string) => {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
};

interface YearPlan {
  start: string;
  end: string;
  schoolYear: number;
  terms: { en: string; ar: string; start: string; end: string }[];
  holidays: {
    start: string;
    end: string;
    code: string;
    en: string;
    ar: string;
  }[];
}

const YEAR: YearPlan = {
  start: "2026-09-13",
  end: "2027-06-18",
  schoolYear: 2027,
  terms: [
    {
      en: "Term 1",
      ar: "الفصل الدراسي الأول",
      start: "2026-09-13",
      end: "2027-01-22",
    },
    {
      en: "Term 2",
      ar: "الفصل الدراسي الثاني",
      start: "2027-02-07",
      end: "2027-06-18",
    },
  ],
  holidays: [
    {
      start: "2026-10-06",
      end: "2026-10-07",
      code: "public_holiday",
      en: "Armed Forces Day",
      ar: "عيد القوات المسلحة",
    },
    {
      start: "2027-01-07",
      end: "2027-01-08",
      code: "public_holiday",
      en: "Coptic Christmas",
      ar: "عيد الميلاد المجيد",
    },
    {
      start: "2027-01-22",
      end: "2027-02-07",
      code: "school_holiday",
      en: "Mid-year break",
      ar: "إجازة نصف العام",
    },
    {
      start: "2027-04-25",
      end: "2027-04-26",
      code: "public_holiday",
      en: "Sinai Liberation Day",
      ar: "عيد تحرير سيناء",
    },
  ],
};

async function seedYear(tx: Tx, tenantId: string, schoolId: string) {
  const events = await descriptorIds(tx, tenantId, "calendar_event");
  const [school] = await tx
    .select({ weekStart: orgs.weekStart, weekendDays: orgs.weekendDays })
    .from(orgs)
    .where(and(eq(orgs.tenantId, tenantId), eq(orgs.id, schoolId)));
  if (!school) throw new Error("Seed school is missing");
  const { weekStart, weekendDays } = school;
  const yearId = Bun.randomUUIDv7();
  await tx.insert(academicSessions).values({
    tenantId,
    id: yearId,
    orgId: schoolId,
    type: "school_year",
    schoolYearId: yearId,
    titleEn: "2026–2027",
    titleAr: "٢٠٢٦–٢٠٢٧",
    span: `[${YEAR.start},${YEAR.end})`,
    schoolYear: YEAR.schoolYear,
    lifecycle: "current",
  });
  await tx.insert(academicSessions).values(
    YEAR.terms.map((term, index) => ({
      tenantId,
      orgId: schoolId,
      type: "term" as const,
      parentId: yearId,
      parentType: "school_year" as const,
      schoolYearId: yearId,
      titleEn: term.en,
      titleAr: term.ar,
      span: `[${term.start},${term.end})`,
      schoolYear: YEAR.schoolYear,
      sequence: index + 1,
    })),
  );
  const calendarId = Bun.randomUUIDv7();
  await tx.insert(calendars).values({
    tenantId,
    id: calendarId,
    orgId: schoolId,
    schoolYearId: yearId,
    code: "school",
    kind: "school",
    titleEn: "School calendar",
    titleAr: "التقويم المدرسي",
  });
  const days: (typeof calendarDates.$inferInsert)[] = [];
  for (let day = YEAR.start; day < YEAR.end; day = addDays(day, 1)) {
    const holiday = YEAR.holidays.find((h) => day >= h.start && day < h.end);
    const weekend = weekendDays.includes(isoWeekday(day));
    const code = weekend
      ? "weekend"
      : holiday
        ? holiday.code
        : "instructional_day";
    days.push({
      tenantId,
      calendarId,
      schoolYearId: yearId,
      dayOn: day,
      eventDescriptorId: need(events, code),
      noteEn: !weekend && holiday ? holiday.en : null,
      noteAr: !weekend && holiday ? holiday.ar : null,
    });
  }
  for (let index = 0; index < days.length; index += 100)
    await tx.insert(calendarDates).values(days.slice(index, index + 100));
  const weeks = teachingWeeks(
    YEAR.start,
    addDays(YEAR.end, -1),
    1,
    weekStart,
  ).map((week) => ({
    tenantId,
    schoolYearId: yearId,
    number: week.number,
    span: `[${week.startsOn},${addDays(week.endsOn, 1)})`,
    labelEn: `Week ${week.number}`,
    labelAr: `الأسبوع ${week.number}`,
  }));
  await tx.insert(academicWeeks).values(weeks);
  const periods: [
    code: string,
    en: string,
    ar: string,
    kind: "lesson" | "registration" | "break",
    start: string,
    end: string,
  ][] = [
    ["reg", "Registration", "التسجيل", "registration", "07:45", "08:00"],
    ["1", "Period 1", "الحصة الأولى", "lesson", "08:00", "08:45"],
    ["2", "Period 2", "الحصة الثانية", "lesson", "08:50", "09:35"],
    ["3", "Period 3", "الحصة الثالثة", "lesson", "09:40", "10:25"],
    ["break", "Break", "الفسحة", "break", "10:25", "10:55"],
    ["4", "Period 4", "الحصة الرابعة", "lesson", "10:55", "11:40"],
    ["5", "Period 5", "الحصة الخامسة", "lesson", "11:45", "12:30"],
    ["6", "Period 6", "الحصة السادسة", "lesson", "12:35", "13:20"],
  ];
  await tx.insert(classPeriods).values(
    periods.map(([code, en, ar, kind, start, end], index) => ({
      tenantId,
      orgId: schoolId,
      schoolYearId: yearId,
      code,
      nameEn: en,
      nameAr: ar,
      sequence: index + 1,
      kind,
      startTime: start,
      endTime: end,
      officialAttendance: kind === "registration",
      validDuring: `[${YEAR.start},${YEAR.end})`,
    })),
  );
  await tx.insert(locations).values(
    ["101", "102", "103", "104", "201", "202", "Lab 1", "Library"].map(
      (code) => ({
        tenantId,
        orgId: schoolId,
        kind: code.startsWith("Lab")
          ? ("lab" as const)
          : code === "Library"
            ? ("library" as const)
            : ("room" as const),
        code: code.replace(" ", "-").toLowerCase(),
        nameEn:
          code.startsWith("Lab") || code === "Library" ? code : `Room ${code}`,
        nameAr:
          code === "Library"
            ? "المكتبة"
            : code.startsWith("Lab")
              ? "المعمل ١"
              : `الغرفة ${code}`,
        capacity: code === "Library" ? 60 : 30,
      }),
    ),
  );
  return { yearId, calendarId };
}

interface Person {
  id: string;
  en: string;
  ar: string;
  sex: "female" | "male";
}

function person(given: Name, family: Name, sex: "female" | "male"): Person {
  return {
    id: Bun.randomUUIDv7(),
    en: `${given[0]} ${family[0]}`,
    ar: `${given[1]} ${family[1]}`,
    sex,
  };
}

async function insertPerson(
  tx: Tx,
  tenantId: string,
  p: Person,
  extra: Partial<typeof users.$inferInsert> = {},
) {
  const sexes = await descriptorIds(tx, tenantId, "sex");
  await tx.insert(users).values({
    tenantId,
    id: p.id,
    fullNameEn: p.en,
    fullNameAr: p.ar,
    givenNameEn: p.en.split(" ")[0] ?? null,
    familyNameEn: p.en.split(" ").slice(1).join(" ") || null,
    givenNameAr: p.ar.split(" ")[0] ?? null,
    familyNameAr: p.ar.split(" ").slice(1).join(" ") || null,
    sexDescriptorId: need(sexes, p.sex),
    ...extra,
  });
}

async function giveAccount(
  tx: Tx,
  tenantId: string,
  userId: string,
  loginName: string,
  passwordHash: string,
) {
  const accountId = Bun.randomUUIDv7();
  await tx.insert(accounts).values({
    tenantId,
    id: accountId,
    userId,
    state: "active",
    webauthnUserHandle: newUserHandle(tenantId),
  });
  await tx.insert(loginIdentities).values({
    tenantId,
    accountId,
    kind: "password",
    loginName,
    secretHash: passwordHash,
    secretSetAt: new Date(),
    linkMethod: "admin",
  });
  await tx
    .update(users)
    .set({ username: loginName })
    .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
  await tx.insert(contactPoints).values({
    tenantId,
    userId,
    kind: "email",
    label: "work",
    value: loginName,
    normalized: loginName,
    purposes: ["notify", "login"],
    verifiedAt: new Date(),
    verificationMethod: "staff_attested",
    source: "manual",
  });
  return accountId;
}

/** Age on 1 September for a grade's usual cohort. */
function ageInSeptember(grade: string): number {
  if (grade === "pre_kg") return 3;
  if (grade === "kg1") return 4;
  if (grade === "kg2") return 5;
  return 5 + Number(grade.replace("grade_", ""));
}

async function role(
  tx: Tx,
  tenantId: string,
  userId: string,
  orgId: string,
  orgType: "school" | "school_group",
  name: typeof userRoles.$inferInsert.role,
  start: string,
  extra: Partial<typeof userRoles.$inferInsert> = {},
) {
  await tx.insert(userRoles).values({
    tenantId,
    userId,
    orgId,
    orgType,
    role: name,
    validDuring: `[${start},)`,
    source:
      name === "student" || ["parent", "guardian", "relative"].includes(name)
        ? "derived"
        : "manual",
    ...extra,
  });
}

interface SchoolPlan {
  slug: string;
  nameEn: string;
  nameAr: string;
  grades: string[];
  studentsPerGrade: number;
}

const TAUGHT_SUBJECTS = ["arabic", "english", "mathematics", "science"];

/** "grade_7" is "7" and "kg2" is "KG2" in class codes and English titles. */
function gradeShort(grade: string) {
  return grade.startsWith("kg")
    ? grade.toUpperCase()
    : grade.replace("grade_", "");
}

function gradeShortAr(grade: string) {
  return grade.startsWith("kg")
    ? `روضة ${grade.slice(2)}`
    : grade.replace("grade_", "");
}

/**
 * One homeroom per grade with its class teacher, and four subject classes
 * taught to it by subject specialists, so a teacher reaches only the grades
 * they teach. Students are enrolled in their grade's homeroom for the year.
 */
async function seedClasses(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  yearId: string,
  grades: readonly string[],
  teachers: readonly Person[],
  pupils: ReadonlyMap<string, readonly string[]>,
) {
  const [gradeIds, subjectIds, positions] = await Promise.all([
    descriptorIds(tx, tenantId, "grade_level"),
    descriptorIds(tx, tenantId, "subject"),
    descriptorIds(tx, tenantId, "classroom_position"),
  ]);
  const subjectNames = new Map(
    (
      CATALOGUE.find((entry) => entry.namespace === "subject")?.values ?? []
    ).map((value) => [value.code, value]),
  );
  const span = `[${YEAR.start},${YEAR.end})`;
  const teacherOf = (index: number) => {
    const teacher = teachers[index % teachers.length];
    if (!teacher) throw new Error("no seeded teacher");
    return teacher;
  };
  for (const [gradeIndex, grade] of grades.entries()) {
    const short = gradeShort(grade);
    const homeroomId = Bun.randomUUIDv7();
    await tx.insert(classes).values({
      tenantId,
      id: homeroomId,
      orgId: schoolId,
      schoolYearId: yearId,
      classType: "homeroom",
      code: `${short}-A`,
      titleEn: `${short}A`,
      titleAr: `${gradeShortAr(grade)} أ`,
      gradeLevelDescriptorId: need(gradeIds, grade),
    });
    const homeroom = {
      tenantId,
      classId: homeroomId,
      classType: "homeroom" as const,
      schoolYearId: yearId,
      orgId: schoolId,
      validDuring: span,
      source: "manual" as const,
    };
    await tx.insert(enrollments).values([
      {
        ...homeroom,
        userId: teacherOf(gradeIndex).id,
        role: "teacher",
        isPrimary: true,
        classroomPositionDescriptorId: need(positions, "teacher_of_record"),
      },
      ...(pupils.get(grade) ?? []).map((userId) => ({
        ...homeroom,
        userId,
        role: "student" as const,
      })),
    ]);
    for (const [subjectIndex, subject] of TAUGHT_SUBJECTS.entries()) {
      const names = subjectNames.get(subject);
      const courseId = Bun.randomUUIDv7();
      await tx.insert(courses).values({
        tenantId,
        id: courseId,
        orgId: schoolId,
        code: `${subject.toUpperCase().slice(0, 4)}-${short}`,
        titleEn: `${names?.en ?? subject} ${short}`,
        titleAr: `${names?.ar ?? subject} ${gradeShortAr(grade)}`,
        subjectDescriptorId: need(subjectIds, subject),
        gradeLevelDescriptorId: need(gradeIds, grade),
      });
      const classId = Bun.randomUUIDv7();
      await tx.insert(classes).values({
        tenantId,
        id: classId,
        orgId: schoolId,
        schoolYearId: yearId,
        classType: "scheduled",
        code: `${short}-A-${subject.toUpperCase().slice(0, 4)}`,
        titleEn: `${short}A ${names?.en ?? subject}`,
        titleAr: `${gradeShortAr(grade)} أ ${names?.ar ?? subject}`,
        courseId,
        homeroomClassId: homeroomId,
        subjectDescriptorId: need(subjectIds, subject),
        gradeLevelDescriptorId: need(gradeIds, grade),
      });
      await tx.insert(enrollments).values({
        tenantId,
        classId,
        classType: "scheduled",
        schoolYearId: yearId,
        orgId: schoolId,
        userId: teacherOf(subjectIndex + 1).id,
        role: "teacher",
        isPrimary: true,
        classroomPositionDescriptorId: need(positions, "teacher_of_record"),
        validDuring: span,
        source: "manual",
      });
    }
  }
}

/**
 * Coursework in every subject class: work already due with handed-in,
 * graded and returned attempts, work due later, a draft, a group, a rubric
 * and first-term grades, so each coursework page has something to show.
 */
async function seedCoursework(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  yearId: string,
) {
  const offerings = await tx.execute<{
    id: string;
    homeroom_class_id: string;
    teacher_id: string;
    title_en: string | null;
  }>(sql`
    select c.id, c.homeroom_class_id, e.user_id as teacher_id, c.title_en
    from core.classes c
    join core.enrollments e on e.tenant_id = c.tenant_id and e.class_id = c.id and e.role = 'teacher'
    where c.tenant_id = ${tenantId}::uuid and c.school_year_id = ${yearId}::uuid
      and c.class_type = 'scheduled'
    order by c.code`);
  const [term] = await tx
    .select({ id: academicSessions.id })
    .from(academicSessions)
    .where(
      and(
        eq(academicSessions.tenantId, tenantId),
        eq(academicSessions.schoolYearId, yearId),
        eq(academicSessions.type, "term"),
      ),
    )
    .orderBy(academicSessions.sequence)
    .limit(1);
  const brief = (hostId: string, text: string) =>
    tx.insert(documents).values({
      tenantId,
      hostType: "assignment",
      hostId,
      orgId: schoolId,
      kind: "rich_text",
      schemaVersion: 1,
      content: plainContent(text) as unknown as Record<string, unknown>,
      plainText: text,
    });
  const rubric = {
    criteria: [
      {
        id: "understanding",
        title: "Understanding",
        levels: [
          { id: "secure", title: "Secure", points: 6 },
          { id: "developing", title: "Developing", points: 3 },
        ],
      },
      {
        id: "presentation",
        title: "Presentation",
        levels: [
          { id: "clear", title: "Clear", points: 4 },
          { id: "unclear", title: "Needs work", points: 1 },
        ],
      },
    ],
  };
  for (const [index, offering] of offerings.entries()) {
    const roster = await tx.execute<{ user_id: string }>(sql`
      select user_id from core.enrollments
      where tenant_id = ${tenantId}::uuid and class_id = ${offering.homeroom_class_id}::uuid
        and role = 'student'
      order by user_id`);
    const students = roster.map((row) => row.user_id);
    const base = {
      tenantId,
      orgId: schoolId,
      classId: offering.id,
      classType: "scheduled" as const,
      schoolYearId: yearId,
      gradingPeriodId: term?.id ?? null,
      authorUserId: offering.teacher_id,
    };
    const dueId = Bun.randomUUIDv7();
    const laterId = Bun.randomUUIDv7();
    const draftId = Bun.randomUUIDv7();
    // Work still out stays out four weeks from whenever the seed runs; a
    // fixed date passed and left a seeded school with nothing assigned.
    const laterDue = new Date();
    laterDue.setUTCDate(laterDue.getUTCDate() + 28);
    laterDue.setUTCHours(12, 0, 0, 0);
    await tx.insert(assignments).values([
      {
        ...base,
        id: dueId,
        title: "Chapter 1 review",
        state: "published",
        availableFrom: new Date("2026-09-15T06:00:00Z"),
        dueAt: new Date("2026-09-24T12:00:00Z"),
        points: 10,
        rubric,
        publishedAt: new Date("2026-09-15T06:00:00Z"),
      },
      {
        ...base,
        id: laterId,
        title: "Project: my neighbourhood",
        state: "published",
        availableFrom: new Date("2026-09-20T06:00:00Z"),
        dueAt: laterDue,
        latePolicy: "deduct",
        lateDeductionPercent: 10,
        points: 20,
        publishedAt: new Date("2026-09-20T06:00:00Z"),
      },
      {
        ...base,
        id: draftId,
        title: "Quiz preparation",
        submissionFormat: "none",
      },
    ]);
    await brief(dueId, "Answer the review questions at the end of chapter 1.");
    await brief(
      laterId,
      "Describe three places near your home and why they matter to you.",
    );
    await brief(draftId, "Revise the vocabulary list before Thursday.");
    if (students.length === 0) continue;
    await tx.insert(assignmentRecipients).values(
      [dueId, laterId].flatMap((assignmentId) =>
        students.map((studentUserId) => ({
          tenantId,
          assignmentId,
          studentUserId,
          source: "class" as const,
        })),
      ),
    );
    for (const [position, studentUserId] of students.slice(0, 3).entries()) {
      const submissionId = Bun.randomUUIDv7();
      await tx.insert(submissions).values({
        tenantId,
        id: submissionId,
        assignmentId: dueId,
        studentUserId,
        state: position === 0 ? "returned" : "submitted",
      });
      const attemptId = Bun.randomUUIDv7();
      await tx.insert(submissionAttempts).values({
        tenantId,
        id: attemptId,
        submissionId,
        studentUserId,
        number: 1,
        isLate: position === 2,
        submittedAt: new Date(
          position === 2 ? "2026-09-25T09:00:00Z" : "2026-09-23T15:00:00Z",
        ),
        submittedByUserId: studentUserId,
      });
      const answer = "My answers to the review questions.";
      await tx.insert(documents).values({
        tenantId,
        hostType: "submission_attempt",
        hostId: attemptId,
        orgId: schoolId,
        kind: "rich_text",
        schemaVersion: 1,
        content: plainContent(answer) as unknown as Record<string, unknown>,
        plainText: answer,
        frozenAt: new Date(
          position === 2 ? "2026-09-25T09:00:00Z" : "2026-09-23T15:00:00Z",
        ),
      });
      if (position < 2)
        await tx.insert(assessments).values({
          tenantId,
          attemptId,
          submissionId,
          studentUserId,
          score: position === 0 ? 8 : 7,
          effectiveScore: position === 0 ? 8 : 7,
          feedback: position === 0 ? "Well reasoned answers." : null,
          gradedByUserId: offering.teacher_id,
          releasedAt: position === 0 ? new Date("2026-09-26T10:00:00Z") : null,
        });
    }
    const groupId = Bun.randomUUIDv7();
    await tx.insert(classGroups).values({
      tenantId,
      id: groupId,
      orgId: schoolId,
      classId: offering.id,
      classType: "scheduled",
      schoolYearId: yearId,
      titleEn: "Reading group",
      titleAr: "مجموعة القراءة",
      createdByUserId: offering.teacher_id,
    });
    await tx.insert(classGroupMembers).values(
      students.slice(0, 2).map((studentUserId) => ({
        tenantId,
        groupId,
        studentUserId,
      })),
    );
    if (index === 0)
      await tx.insert(rubrics).values({
        tenantId,
        orgId: schoolId,
        ownerUserId: offering.teacher_id,
        title: "Written answers",
        criteria: rubric,
      });
    if (term && index % TAUGHT_SUBJECTS.length === 0)
      await tx.insert(periodGrades).values(
        students.map((studentUserId, position) => ({
          tenantId,
          orgId: schoolId,
          classId: offering.id,
          classType: "scheduled" as const,
          schoolYearId: yearId,
          gradingPeriodId: term.id,
          studentUserId,
          score: 70 + position * 4,
          recordedByUserId: offering.teacher_id,
          releasedAt: new Date("2026-09-26T10:00:00Z"),
        })),
      );
  }
}

async function seedSchool(
  tx: Tx,
  tenant: ProvisionedTenant,
  schoolId: string,
  plan: SchoolPlan,
  context: {
    passwordHash: string;
    next: () => number;
    kek: KeyEncryptionKey;
    cell: string;
    domain: string;
    logins: SeededTenant["logins"];
    shared: {
      reference: number;
      teacher?: Person;
      siblingsOf?: {
        mother: Person;
        father: Person;
        family: Name;
      };
    };
  },
) {
  const { tenantId } = tenant;
  const { next } = context;
  const pick = <T>(list: readonly T[]): T => {
    const value = list[Math.floor(next() * list.length)];
    if (value === undefined) throw new Error("empty list");
    return value;
  };
  const { yearId, calendarId } = await seedYear(tx, tenantId, schoolId);
  const positions = await descriptorIds(tx, tenantId, "staff_position");
  const grades = await descriptorIds(tx, tenantId, "grade_level");
  const relations = await descriptorIds(tx, tenantId, "relation");
  const entries = await descriptorIds(tx, tenantId, "school_entry_type");
  const idSystems = await descriptorIds(tx, tenantId, "external_id_system");

  const principal = person(pick(MOTHERS), pick(FAMILIES), "female");
  await insertPerson(tx, tenantId, principal, { primaryOrgId: schoolId });
  await role(
    tx,
    tenantId,
    principal.id,
    schoolId,
    "school",
    "principal",
    "2020-09-01",
    {
      positionDescriptorId: need(positions, "principal"),
    },
  );
  const principalLogin = `principal.${plan.slug}@${context.domain}`;
  await giveAccount(
    tx,
    tenantId,
    principal.id,
    principalLogin,
    context.passwordHash,
  );
  context.logins.push({
    role: "principal",
    loginName: principalLogin,
    schoolId,
  });

  const office = person(pick(BOYS), pick(FAMILIES), "male");
  await insertPerson(tx, tenantId, office, { primaryOrgId: schoolId });
  await role(
    tx,
    tenantId,
    office.id,
    schoolId,
    "school",
    "staff",
    "2022-09-01",
    {
      positionDescriptorId: need(positions, "administrative_staff"),
    },
  );
  const officeLogin = `office.${plan.slug}@${context.domain}`;
  await giveAccount(tx, tenantId, office.id, officeLogin, context.passwordHash);
  context.logins.push({ role: "staff", loginName: officeLogin, schoolId });

  const teachers: Person[] = [];
  for (let index = 0; index < 6; index += 1) {
    const sex = index % 2 === 0 ? "female" : "male";
    const teacher = person(
      pick(sex === "female" ? MOTHERS : BOYS),
      pick(FAMILIES),
      sex,
    );
    await insertPerson(tx, tenantId, teacher, { primaryOrgId: schoolId });
    await role(
      tx,
      tenantId,
      teacher.id,
      schoolId,
      "school",
      "teacher",
      "2021-09-01",
      {
        positionDescriptorId: need(positions, "teacher"),
      },
    );
    const login = `teacher${index + 1}.${plan.slug}@${context.domain}`;
    await giveAccount(tx, tenantId, teacher.id, login, context.passwordHash);
    context.logins.push({ role: "teacher", loginName: login, schoolId });
    teachers.push(teacher);
  }
  if (context.shared.teacher)
    await role(
      tx,
      tenantId,
      context.shared.teacher.id,
      schoolId,
      "school",
      "teacher",
      "2023-09-01",
      {
        positionDescriptorId: need(positions, "teacher"),
      },
    );
  else context.shared.teacher = teachers[0];

  const pupils = new Map<string, string[]>();
  for (const grade of plan.grades) {
    for (let index = 0; index < plan.studentsPerGrade; index += 1) {
      const shared =
        index === 0 && grade === plan.grades[0]
          ? context.shared.siblingsOf
          : undefined;
      const family = shared?.family ?? pick(FAMILIES);
      const sex = next() < 0.5 ? "female" : "male";
      const student = person(
        pick(sex === "female" ? GIRLS : BOYS),
        family,
        sex,
      );
      const birthYear = 2026 - ageInSeptember(grade);
      await insertPerson(tx, tenantId, student, {
        primaryOrgId: schoolId,
        birthDate: `${birthYear}-0${1 + Math.floor(next() * 9)}-1${Math.floor(next() * 9)}`,
        birthDateSource: "school_record",
      });
      pupils.set(grade, [...(pupils.get(grade) ?? []), student.id]);
      await tx.insert(studentSchoolYears).values({
        tenantId,
        studentUserId: student.id,
        orgId: schoolId,
        schoolYearId: yearId,
        validDuring: `[${YEAR.start},${YEAR.end})`,
        gradeLevelDescriptorId: need(grades, grade),
        calendarId,
        entryTypeDescriptorId: need(entries, "continuing"),
        source: "manual",
      });
      await role(
        tx,
        tenantId,
        student.id,
        schoolId,
        "school",
        "student",
        "2024-09-01",
      );
      context.shared.reference += 1;
      const reference = context.shared.reference;
      await tx.insert(externalIds).values({
        tenantId,
        userId: student.id,
        systemDescriptorId: need(idSystems, "school_reference"),
        systemMeaning: "school_reference",
        identifier: `${plan.slug.slice(0, 2).toUpperCase()}${reference}`,
        assigningOrgId: schoolId,
        validDuring: "[2024-09-01,)",
      });

      const mother =
        shared?.mother ?? person(pick(MOTHERS), pick(FAMILIES), "female");
      const father = shared?.father ?? person(pick(BOYS), family, "male");
      if (!shared) {
        await insertPerson(tx, tenantId, mother);
        await insertPerson(tx, tenantId, father);
        const phone = (offset: number) =>
          `+2010${String(Math.floor(next() * 90_000_000) + 10_000_000 + offset).slice(0, 8)}`;
        for (const [parent, number] of [
          [mother, phone(1)],
          [father, phone(2)],
        ] as const)
          await tx.insert(contactPoints).values({
            tenantId,
            userId: parent.id,
            kind: "phone",
            label: "mobile",
            value: number,
            normalized: number,
            smsCapable: true,
            source: "manual",
          });
        const motherLogin = `parent${reference}@${context.domain}`;
        await giveAccount(
          tx,
          tenantId,
          mother.id,
          motherLogin,
          context.passwordHash,
        );
        context.logins.push({
          role: "parent",
          loginName: motherLogin,
          schoolId,
        });
        if (
          index === 0 &&
          grade === plan.grades[0] &&
          !context.shared.siblingsOf
        )
          context.shared.siblingsOf = { mother, father, family };
      }
      for (const [parent, relation, portal] of [
        [mother, "mother", true],
        [father, "father", index % 3 !== 0],
      ] as const) {
        await tx.insert(userRelationships).values({
          tenantId,
          studentUserId: student.id,
          relatedUserId: parent.id,
          relationDescriptorId: need(relations, relation),
          relationMeaning: relation,
          legalGuardian: true,
          portalAccess: portal,
          receivesNotifications: portal,
          primaryContact: relation === "mother",
          emergencyContact: true,
          contactPriority: relation === "mother" ? 1 : 2,
          residence: "primary",
          pickup: "allowed",
          validDuring: "[2024-09-01,)",
          verificationMethod: "staff_attested",
          verifiedAt: new Date(),
        });
        if (portal)
          await tx
            .insert(userRoles)
            .values({
              tenantId,
              userId: parent.id,
              orgId: schoolId,
              orgType: "school",
              role: "parent",
              validDuring: "[2024-09-01,)",
              source: "derived",
            })
            .onConflictDoNothing();
      }
      // Two classmates can sign in, so what one student shows another can be tried.
      if (grade === "grade_8" && index < 2) {
        const studentLogin = `student${reference}@${context.domain}`;
        await giveAccount(
          tx,
          tenantId,
          student.id,
          studentLogin,
          context.passwordHash,
        );
        context.logins.push({
          role: "student",
          loginName: studentLogin,
          schoolId,
        });
      }
      if (index === 1 && grade === plan.grades[1]) {
        await seedHealth(tx, tenantId, student.id, context);
        await seedIdentity(tx, tenantId, student.id, context);
        const religions = await descriptorIds(tx, tenantId, "religion");
        await withPurpose(tx, "demographics", (inner) =>
          inner.insert(demographics).values({
            tenantId,
            userId: student.id,
            birthCountryCode: "EG",
            birthCity: "Cairo",
            nationalityCodes: ["EG"],
            religionDescriptorId: need(religions, "islam"),
            homeLanguages: ["ar", "en"],
          }),
        );
      }
    }
  }
  const registrar = await tx
    .insert(accessRoles)
    .values({
      tenantId,
      orgId: schoolId,
      nameEn: "Registrar",
      nameAr: "مسجل المدرسة",
      descriptionEn: "Admissions, records and family links.",
      descriptionAr: "القبول والسجلات وروابط الأسر.",
      capabilities: [
        "people:read",
        "people:manage",
        "guardians:manage",
        "contacts:read",
        "custody:read",
        "custody:write",
        "demographics:read",
        "demographics:write",
      ],
    })
    .returning({ id: accessRoles.id });
  const registrarId = registrar[0]?.id;
  if (registrarId)
    await tx.insert(accessRoleAssignments).values({
      tenantId,
      userId: office.id,
      accessRoleId: registrarId,
      orgId: schoolId,
      validDuring: "[2026-09-01,)",
      grantedByUserId: principal.id,
      reason: "Runs admissions this year.",
    });
  await seedClasses(
    tx,
    tenantId,
    schoolId,
    yearId,
    plan.grades,
    teachers,
    pupils,
  );
  await seedTimetable(tx, tenantId, schoolId, yearId);
  await seedCoursework(tx, tenantId, schoolId, yearId);
  await seedAttendance(tx, tenantId, schoolId, yearId);
  await seedMessages(tx, tenantId, schoolId, yearId);
  await seedAnnouncements(tx, tenantId, schoolId);
  await seedSchoolNews(tx, tenantId, schoolId);
  await seedConsents(
    tx,
    tenantId,
    schoolId,
    pupils.get(plan.grades[1] ?? "") ?? [],
  );
  await seedEvents(tx, tenantId, schoolId, yearId);
  await seedNotifications(tx, tenantId, schoolId);
  await seedLearning(tx, tenantId, schoolId, yearId);
  await seedSite(tx, tenantId, schoolId);
  return { yearId, teachers };
}

/**
 * A week for every homeroom: its subject classes rotate through the lesson
 * periods, each homeroom in its own room, and a subject's teacher never meets
 * two grades at once because each grade starts the rotation one step on.
 */
async function seedTimetable(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  yearId: string,
) {
  const [school] = await tx
    .select({ weekStart: orgs.weekStart, weekendDays: orgs.weekendDays })
    .from(orgs)
    .where(and(eq(orgs.tenantId, tenantId), eq(orgs.id, schoolId)));
  if (!school) throw new Error("no seeded school");
  const days = schoolDays(school.weekStart, school.weekendDays);
  const periods = await tx
    .select({ id: classPeriods.id })
    .from(classPeriods)
    .where(
      and(
        eq(classPeriods.tenantId, tenantId),
        eq(classPeriods.schoolYearId, yearId),
        eq(classPeriods.kind, "lesson"),
      ),
    )
    .orderBy(classPeriods.sequence);
  const rooms = await tx
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.tenantId, tenantId),
        eq(locations.orgId, schoolId),
        eq(locations.kind, "room"),
      ),
    )
    .orderBy(locations.code);
  const offered = await tx.execute<{
    id: string;
    homeroom_class_id: string;
    teacher_id: string;
  }>(sql`
    select c.id, c.homeroom_class_id, e.user_id as teacher_id
    from core.classes c
    join core.enrollments e on e.tenant_id = c.tenant_id and e.class_id = c.id
      and e.role = 'teacher' and e.is_primary
    join core.classes h on h.tenant_id = c.tenant_id and h.id = c.homeroom_class_id
    where c.tenant_id = ${tenantId}::uuid and c.org_id = ${schoolId}::uuid
      and c.school_year_id = ${yearId}::uuid and c.class_type = 'scheduled'
    order by h.code, c.code`);
  const homerooms = [...new Set(offered.map((row) => row.homeroom_class_id))];
  const meetings: (typeof classMeetings.$inferInsert)[] = [];
  for (const [grade, homeroomId] of homerooms.entries()) {
    const subjects = offered.filter(
      (row) => row.homeroom_class_id === homeroomId,
    );
    const room = rooms[grade % Math.max(rooms.length, 1)];
    for (const [dayIndex, weekday] of days.entries())
      for (const [periodIndex, period] of periods.entries()) {
        const taught =
          subjects[(periodIndex + dayIndex + grade) % subjects.length];
        if (!taught) continue;
        meetings.push({
          tenantId,
          orgId: schoolId,
          classId: taught.id,
          classType: "scheduled",
          schoolYearId: yearId,
          groupClassId: homeroomId,
          weekday,
          classPeriodId: period.id,
          teacherUserId: taught.teacher_id,
          locationId: room?.id ?? null,
          validDuring: `[${YEAR.start},${YEAR.end})`,
        });
      }
  }
  for (let index = 0; index < meetings.length; index += 200)
    await tx.insert(classMeetings).values(meetings.slice(index, index + 200));
}

/**
 * A pinned welcome to everyone, a trip notice families must acknowledge, and
 * a draft still being written, so the feed, the reader and the editor each
 * open on something.
 */
async function seedAnnouncements(tx: Tx, tenantId: string, schoolId: string) {
  const [principal] = await tx.execute<{ user_id: string }>(sql`
    select r.user_id from core.user_roles r
    where r.tenant_id = ${tenantId}::uuid and r.org_id = ${schoolId}::uuid
      and r.role in ('principal', 'site_administrator') and r.status = 'active'
    order by r.role, r.user_id limit 1`);
  if (!principal) return;
  const on = "2026-09-27";
  const plans: {
    title: string;
    body: string;
    audience: Audience;
    urgency: "normal" | "important";
    pinnedUntil?: string;
    requiresAck?: boolean;
    ackDueOn?: string;
    publishAt: Date | null;
  }[] = [
    {
      title: "Welcome to the new school year",
      body: "Registers open at 7:45 each morning. The timetable and the reading lists for the term are in the app.",
      audience: { scope: "school", classId: null, gradeId: null },
      urgency: "normal",
      pinnedUntil: "2026-10-31",
      publishAt: new Date("2026-09-13T06:00:00Z"),
    },
    {
      title: "Museum trip permission",
      body: "The museum trip is on 15 October. Please acknowledge that your child may join by 8 October.",
      audience: { scope: "families", classId: null, gradeId: null },
      urgency: "important",
      requiresAck: true,
      ackDueOn: "2026-10-08",
      publishAt: new Date("2026-09-24T09:00:00Z"),
    },
    {
      title: "Parents' evening",
      body: "Parents' evening dates will follow once teachers confirm their slots.",
      audience: { scope: "families", classId: null, gradeId: null },
      urgency: "normal",
      publishAt: null,
    },
  ];
  for (const plan of plans) {
    const id = Bun.randomUUIDv7();
    await tx.insert(announcements).values({
      tenantId,
      id,
      orgId: schoolId,
      titleEn: plan.title,
      urgency: plan.urgency,
      state: plan.publishAt ? "published" : "draft",
      publishAt: plan.publishAt,
      pinnedUntil: plan.pinnedUntil ?? null,
      requiresAck: plan.requiresAck ?? false,
      ackDueOn: plan.ackDueOn ?? null,
      authorUserId: principal.user_id,
    });
    await tx.insert(announcementAudiences).values({
      tenantId,
      announcementId: id,
      scope: plan.audience.scope,
    });
    await tx.insert(documents).values({
      tenantId,
      hostType: "announcement",
      hostId: id,
      orgId: schoolId,
      kind: "rich_text",
      locale: "en",
      schemaVersion: 1,
      content: plainContent(plan.body) as unknown as Record<string, unknown>,
      plainText: plan.body,
    });
    if (plan.publishAt)
      await addRecipients(tx, {
        tenantId,
        announcementId: id,
        userIds: await audienceUsers(tx, { tenantId, schoolId, on }, [
          plan.audience,
        ]),
      });
  }
}

const part = (heading: string, body: string) => ({
  heading,
  body: plainContent(body),
});

/**
 * September's news sent to the school in both languages, the Arabic not yet
 * checked against the English, and October's still a draft. Both are for
 * the school only, never the website.
 */
async function seedSchoolNews(tx: Tx, tenantId: string, schoolId: string) {
  const [principal] = await tx.execute<{ user_id: string }>(sql`
    select r.user_id from core.user_roles r
    where r.tenant_id = ${tenantId}::uuid and r.org_id = ${schoolId}::uuid
      and r.role in ('principal', 'site_administrator') and r.status = 'active'
    order by r.role, r.user_id limit 1`);
  if (!principal) return;
  const plans = [
    {
      slug: "september-newsletter",
      title: "September newsletter",
      publishAt: new Date("2026-09-18T07:00:00Z"),
      english: headedContent([
        part(
          "From the principal",
          "A warm welcome back to every family. The first weeks have gone smoothly, and the new timetable is settling in.",
        ),
        part(
          "Dates for October",
          "The museum trip is on 15 October and parents' evening follows at the end of the month.",
        ),
        part(
          "Clubs",
          "Chess, robotics and choir start next week. Sign-up sheets are with homeroom teachers.",
        ),
      ]),
      arabic: headedContent([
        part(
          "كلمة المديرة",
          "مرحبًا بعودة جميع الأسر. مرت الأسابيع الأولى بسلاسة، والجدول الجديد يستقر.",
        ),
        part(
          "مواعيد أكتوبر",
          "رحلة المتحف في ١٥ أكتوبر، ويليها لقاء أولياء الأمور في نهاية الشهر.",
        ),
        part("الأندية", "تبدأ أندية الشطرنج والروبوتات والكورال الأسبوع المقبل."),
      ]),
    },
    {
      slug: "october-newsletter",
      title: "October newsletter",
      publishAt: null,
      english: headedContent([
        part("From the principal", "Notes for October will follow."),
      ]),
      arabic: null,
    },
  ];
  const audience: Audience = { scope: "school", classId: null, gradeId: null };
  for (const plan of plans) {
    const created = await insertPost(tx, {
      tenantId,
      orgId: schoolId,
      authorId: principal.user_id,
      categoryId: null,
      slug: plan.slug,
      titleEn: plan.title,
      titleAr: "",
      excerptEn: "",
      excerptAr: "",
      coverFileId: null,
      coverAltEn: "",
      coverAltAr: "",
      pinned: false,
      visibility: "school",
    });
    await setAudiences(tx, {
      tenantId,
      owner: { kind: "site_post", id: created.id },
      audiences: [audience],
    });
    const host = { type: "site_post", id: created.id };
    const original = await saveDocument(tx, {
      tenantId,
      orgId: schoolId,
      host,
      kind: "rich_text",
      locale: "en",
      content: plan.english as unknown as Record<string, unknown>,
      plainText: contentPlainText(plan.english),
      mediaIds: [],
      userId: principal.user_id,
    });
    const translation = plan.arabic
      ? await saveTranslation(tx, {
          tenantId,
          orgId: schoolId,
          host,
          originalId: original.id,
          locale: "ar",
          kind: "rich_text",
          content: plan.arabic as unknown as Record<string, unknown>,
          plainText: contentPlainText(plan.arabic),
          mediaIds: [],
          userId: principal.user_id,
        })
      : null;
    if (!plan.publishAt) continue;
    await setPostState(tx, {
      tenantId,
      id: created.id,
      expectedVersion: created.version,
      state: "published",
      publishedAt: plan.publishAt.toISOString(),
    });
    for (const document of [original, translation])
      if (document)
        await snapshotPublish(tx, {
          tenantId,
          documentId: document.id,
          userId: principal.user_id,
        });
    await addPostRecipients(tx, {
      tenantId,
      postId: created.id,
      userIds: await audienceUsers(
        tx,
        { tenantId, schoolId, on: "2026-09-27" },
        [audience],
      ),
    });
  }
}

/**
 * Photo consent forms published in both languages and a medicine form still
 * in draft. Two families in the second grade have answered the website
 * form: one agreed in the app, the other told the office no.
 */
async function seedConsents(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  students: readonly string[],
) {
  const [principal] = await tx.execute<{ user_id: string }>(sql`
    select r.user_id from core.user_roles r
    where r.tenant_id = ${tenantId}::uuid and r.org_id = ${schoolId}::uuid
      and r.role in ('principal', 'site_administrator') and r.status = 'active'
    order by r.role, r.user_id limit 1`);
  if (!principal) return;
  const purposes = await descriptorIds(tx, tenantId, "consent_purpose");
  const forms = [
    {
      code: "photo_school_website",
      publish: true,
      english: headedContent([
        part(
          "What we are asking",
          "May we show photos of your child at school events on the school website?",
        ),
        part(
          "Which information",
          "Photos only, never with your child's full name.",
        ),
        part(
          "Changing your mind",
          "You can change your answer at any time and we take the photos down.",
        ),
      ]),
      arabic: headedContent([
        part(
          "ما نطلبه",
          "هل نعرض صور طفلك في فعاليات المدرسة على موقع المدرسة؟",
        ),
        part("البيانات المعنية", "الصور فقط، ولا يُذكر اسم طفلك كاملًا."),
        part("تغيير رأيك", "يمكنك تغيير إجابتك في أي وقت وسنزيل الصور."),
      ]),
    },
    {
      code: "photo_school_news",
      publish: true,
      english: headedContent([
        part(
          "What we are asking",
          "May photos of your child appear in news shared with families of the school?",
        ),
      ]),
      arabic: headedContent([
        part(
          "ما نطلبه",
          "هل تظهر صور طفلك في الأخبار التي تُرسل إلى أسر المدرسة؟",
        ),
      ]),
    },
    {
      code: "administer_medicine",
      publish: false,
      english: headedContent([
        part(
          "What we are asking",
          "May the school nurse give your child the medicine you send in?",
        ),
      ]),
      arabic: null,
    },
  ];
  const noticeOf = new Map<string, string>();
  for (const form of forms) {
    const id = crypto.randomUUID();
    const host = { type: "privacy_notice", id };
    const original = await saveDocument(tx, {
      tenantId,
      orgId: schoolId,
      host,
      kind: "rich_text",
      locale: "en",
      content: form.english as unknown as Record<string, unknown>,
      plainText: contentPlainText(form.english),
      mediaIds: [],
      userId: principal.user_id,
    });
    if (form.arabic)
      await saveTranslation(tx, {
        tenantId,
        orgId: schoolId,
        host,
        originalId: original.id,
        locale: "ar",
        kind: "rich_text",
        content: form.arabic as unknown as Record<string, unknown>,
        plainText: contentPlainText(form.arabic),
        mediaIds: [],
        userId: principal.user_id,
      });
    const version = await insertForm(tx, {
      tenantId,
      schoolId,
      id,
      purposeId: need(purposes, form.code),
      locale: "en",
      versionLabel: "1",
      documentId: original.id,
      supersedesId: null,
    });
    if (form.publish) {
      await publishForm(tx, { tenantId, id, expectedVersion: version });
      noticeOf.set(form.code, id);
    }
  }
  const website = noticeOf.get("photo_school_website");
  if (!website) return;
  for (const [index, studentId] of students.slice(1, 3).entries()) {
    const [mother] = await tx.execute<{ id: string; related_user_id: string }>(
      sql`select r.id, r.related_user_id from core.user_relationships r
        where r.tenant_id = ${tenantId}::uuid and r.student_user_id = ${studentId}::uuid
          and r.relation_meaning = 'mother' and r.status = 'active'`,
    );
    if (!mother) continue;
    const agreed = index === 0;
    await insertAnswer(tx, {
      tenantId,
      studentId,
      purposeId: need(purposes, "photo_school_website"),
      decision: agreed ? "granted" : "refused",
      noticeId: website,
      givenById: mother.related_user_id,
      relationshipId: mother.id,
      method: agreed ? "electronic" : "verbal_recorded",
      evidenceFileId: null,
      recordedById: agreed ? mother.related_user_id : principal.user_id,
      givenOn: "2026-09-20",
      ageAtDecision: null,
      refreshDueOn: null,
      note: agreed ? null : "Told the office at pickup.",
    });
  }
}

/**
 * A month of events around the seeded today: a trip for one class, a staff
 * meeting, parents' evening, a match still to be confirmed and one called off.
 */
async function seedEvents(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  yearId: string,
) {
  const [principal] = await tx.execute<{ user_id: string }>(sql`
    select r.user_id from core.user_roles r
    where r.tenant_id = ${tenantId}::uuid and r.org_id = ${schoolId}::uuid
      and r.role in ('principal', 'site_administrator') and r.status = 'active'
    order by r.role, r.user_id limit 1`);
  const [eight] = await tx.execute<{ id: string }>(sql`
    select id from core.classes
    where tenant_id = ${tenantId}::uuid and school_year_id = ${yearId}::uuid
      and class_type = 'homeroom' and title_en = '8A' and status = 'active'`);
  if (!principal) return;
  const school: Audience = { scope: "school", classId: null, gradeId: null };
  const families: Audience = {
    scope: "families",
    classId: null,
    gradeId: null,
  };
  const staff: Audience = { scope: "staff", classId: null, gradeId: null };
  const plans: {
    title: string;
    titleAr: string;
    public?: boolean;
    category: "trip" | "meeting" | "sport" | "performance";
    startsOn: string;
    endsOn?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    provisional?: boolean;
    cancelled?: boolean;
    audiences: Audience[];
    body: string;
  }[] = [
    {
      title: "Staff meeting",
      titleAr: "اجتماع المعلمين",
      category: "meeting",
      startsOn: "2026-09-30",
      startTime: "14:30",
      endTime: "15:30",
      location: "Library",
      audiences: [staff],
      body: "Term planning and the new attendance registers.",
    },
    {
      title: "Museum trip",
      titleAr: "رحلة المتحف",
      category: "trip",
      startsOn: "2026-10-15",
      startTime: "08:30",
      endTime: "13:00",
      location: "Egyptian Museum",
      audiences: eight
        ? [{ scope: "class", classId: eight.id, gradeId: null }]
        : [families],
      body: "Buses leave from the main gate. Bring a packed lunch.",
    },
    {
      title: "Parents' evening",
      titleAr: "أمسية أولياء الأمور",
      category: "meeting",
      startsOn: "2026-10-29",
      startTime: "17:00",
      endTime: "19:30",
      location: "Main hall",
      audiences: [families, staff],
      body: "Meet each of your child's teachers for ten minutes.",
    },
    {
      title: "Football against Nile School",
      titleAr: "مباراة كرة القدم مع مدرسة النيل",
      public: true,
      category: "sport",
      startsOn: "2026-10-22",
      provisional: true,
      audiences: [school],
      body: "The date depends on the league draw.",
    },
    {
      title: "Autumn concert",
      titleAr: "الحفل الخريفي",
      public: true,
      category: "performance",
      startsOn: "2026-10-01",
      startTime: "18:00",
      endTime: "19:30",
      cancelled: true,
      audiences: [school],
      body: "Moved to December; a new date will follow.",
    },
  ];
  for (const plan of plans) {
    const id = Bun.randomUUIDv7();
    await tx.insert(calendarEvents).values({
      tenantId,
      id,
      orgId: schoolId,
      titleEn: plan.title,
      titleAr: plan.titleAr,
      public: plan.public ?? false,
      category: plan.category,
      startsOn: plan.startsOn,
      endsOn: plan.endsOn ?? plan.startsOn,
      startTime: plan.startTime ?? null,
      endTime: plan.endTime ?? null,
      location: plan.location ?? null,
      provisional: plan.provisional ?? false,
      cancelled: plan.cancelled ?? false,
      authorUserId: principal.user_id,
    });
    await tx.insert(calendarEventAudiences).values(
      plan.audiences.map((audience) => ({
        tenantId,
        eventId: id,
        scope: audience.scope,
        classId: audience.classId,
      })),
    );
    await tx.insert(documents).values({
      tenantId,
      hostType: "calendar_event",
      hostId: id,
      orgId: schoolId,
      kind: "rich_text",
      schemaVersion: 1,
      content: plainContent(plan.body) as unknown as Record<string, unknown>,
      plainText: plan.body,
    });
  }
}

/**
 * The trip notice waiting on each family it reached, with the email the
 * development cell could not send for want of a gateway.
 */
async function seedNotifications(tx: Tx, tenantId: string, schoolId: string) {
  const rows = await tx.execute<{
    id: string;
    title: string;
    user_id: string;
  }>(sql`
    select a.id, a.title_en as title, r.user_id from core.announcements a
    join core.announcement_recipients r on r.tenant_id = a.tenant_id and r.announcement_id = a.id
    where a.tenant_id = ${tenantId}::uuid and a.org_id = ${schoolId}::uuid
      and a.requires_ack and a.state = 'published'`);
  const inserted = await insertNotifications(tx, {
    tenantId,
    orgId: schoolId,
    actorId: null,
    rows: rows.map((row) => ({
      userId: row.user_id,
      kind: "announcement" as const,
      subjectType: "announcement",
      subjectId: row.id,
      params: { title: row.title },
      needsAction: true,
    })),
  });
  await insertDeliveries(tx, {
    tenantId,
    rows: inserted.map((row) => ({
      notificationId: row.id,
      notificationCreatedAt: row.createdAt,
      userId: row.userId,
      channel: "email" as const,
      address: null,
      locale: "en" as const,
      state: "skipped" as const,
      reason: "no_provider" as const,
      dueAt: new Date(row.createdAt),
      digest: false,
    })),
  });
}

/**
 * A published module for 8A, or the first homeroom of a school without one
 * (a reading, a quiz and a reflection), with the
 * first lesson done by one student, and a draft the teacher is still writing.
 */
async function seedLearning(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  yearId: string,
) {
  for (const feature of ["elearning", "early_years"] as const)
    await setOrgFeature(tx, {
      tenantId,
      orgId: schoolId,
      feature,
      enabled: true,
    });
  const [homeroom] = await tx.execute<{ id: string; teacher_id: string }>(sql`
    select c.id, e.user_id as teacher_id from core.classes c
    join core.enrollments e on e.tenant_id = c.tenant_id and e.class_id = c.id
      and e.role = 'teacher' and e.status = 'active'
    where c.tenant_id = ${tenantId}::uuid and c.school_year_id = ${yearId}::uuid
      and c.class_type = 'homeroom' and c.status = 'active'
    order by (c.title_en = '8A') desc, c.code, e.user_id limit 1`);
  if (!homeroom) return;
  const [student] = await tx.execute<{ user_id: string }>(sql`
    select user_id from core.enrollments
    where tenant_id = ${tenantId}::uuid and class_id = ${homeroom.id}::uuid
      and role = 'student' and status = 'active'
    order by user_id limit 1`);
  const quizId = Bun.randomUUIDv7();
  const right = Bun.randomUUIDv7();
  const plans = [
    {
      title: "Reading stories together",
      summary: "How stories are built, with a short check and a reflection.",
      published: true,
      lessons: [
        {
          title: "What makes a story",
          completion: "view" as const,
          blocks: [
            {
              id: Bun.randomUUIDv7(),
              type: "content",
              content: plainContent(
                "Every story has characters, a setting and a problem that gets solved.",
              ),
            },
          ],
        },
        {
          title: "Check your understanding",
          completion: "quiz" as const,
          blocks: [
            {
              id: quizId,
              type: "choice",
              prompt: "Which of these is part of every story?",
              points: 1,
              hints: ["Think about what makes the characters act."],
              explanation: "Stories move because a problem needs solving.",
              tries: null,
              options: [
                {
                  id: right,
                  text: "A problem that gets solved",
                  feedback: "Yes: without a problem, nothing happens.",
                },
                {
                  id: Bun.randomUUIDv7(),
                  text: "A dragon",
                  feedback: "Some stories have dragons, but most do not.",
                },
                {
                  id: Bun.randomUUIDv7(),
                  text: "A happy song",
                  feedback: "",
                },
              ],
              correctOptionIds: [right],
              multiple: false,
              shuffle: true,
            },
            {
              id: Bun.randomUUIDv7(),
              type: "text",
              prompt: "What do we call the place and time a story happens?",
              points: 1,
              hints: ["It starts with s."],
              explanation: "The setting is where and when a story happens.",
              tries: 3,
              answers: ["setting", "المكان والزمان"],
              caseSensitive: false,
              closeEnough: true,
              tehMarbuta: true,
            },
            {
              id: Bun.randomUUIDv7(),
              type: "gaps",
              prompt: "Complete the sentence.",
              points: 2,
              hints: [],
              explanation: "",
              tries: null,
              caseSensitive: false,
              closeEnough: true,
              tehMarbuta: false,
              segments: [
                { type: "text", text: "The people in a story are its " },
                {
                  type: "gap",
                  id: Bun.randomUUIDv7(),
                  answers: ["characters"],
                  options: [],
                },
                { type: "text", text: ", and the story ends when the " },
                {
                  type: "gap",
                  id: Bun.randomUUIDv7(),
                  answers: ["problem"],
                  options: ["problem", "setting", "title"],
                },
                { type: "text", text: " is solved." },
              ],
            },
          ],
        },
        {
          title: "Your favourite story",
          completion: "reflection" as const,
          blocks: [
            {
              id: Bun.randomUUIDv7(),
              type: "written",
              prompt:
                "Which story do you love, and what problem does it solve?",
              points: 4,
              hints: [],
              explanation: "",
              tries: null,
              wordLimit: 200,
            },
          ],
        },
      ],
    },
    {
      title: "Poetry out loud",
      summary: "Rhythm and rhyme, read aloud.",
      published: false,
      lessons: [
        {
          title: "Hearing the beat",
          completion: "mark" as const,
          blocks: [
            {
              id: Bun.randomUUIDv7(),
              type: "content",
              content: plainContent("Clap along as you read the first poem."),
            },
          ],
        },
      ],
    },
  ];
  for (const plan of plans) {
    const created = await insertModule(tx, {
      tenantId,
      schoolId,
      yearId,
      authorId: homeroom.teacher_id,
      title: plan.title,
      summary: plan.summary,
      sequential: true,
      prerequisiteId: null,
      prerequisiteScore: null,
      practiceBands: [],
    });
    await setModuleClasses(tx, {
      tenantId,
      moduleId: created.id,
      classIds: [homeroom.id],
    });
    const lessonIds: string[] = [];
    for (const lesson of plan.lessons) {
      const row = await insertLesson(tx, {
        tenantId,
        moduleId: created.id,
        title: lesson.title,
        completion: lesson.completion,
        passScore: null,
        review: false,
        vowelMarks: "shown",
        language: null,
        translationTitle: null,
        young: false,
        readAlong: true,
        condition: null,
        bands: [],
      });
      lessonIds.push(row.id);
      const content = { version: 2, blocks: lesson.blocks };
      const [document] = await tx
        .insert(documents)
        .values({
          tenantId,
          hostType: "lesson",
          hostId: row.id,
          orgId: schoolId,
          kind: "lesson",
          schemaVersion: 2,
          content,
          plainText: lesson.title,
        })
        .returning({ id: documents.id });
      if (plan.published && document)
        await snapshotPublish(tx, {
          tenantId,
          documentId: document.id,
          userId: homeroom.teacher_id,
        });
    }
    if (plan.published)
      await setModuleState(tx, {
        tenantId,
        id: created.id,
        expectedVersion: created.version,
        state: "published",
        publishAt: new Date("2026-09-20T06:00:00Z").toISOString(),
      });
    const [first] = lessonIds;
    if (plan.published && student && first)
      await recordProgress(tx, {
        tenantId,
        lessonId: first,
        studentId: student.user_id,
        completed: { by: "student" },
      });
  }
}

/** A seeded moment in the week before the seeded today. */
const at = (day: number, hour: number) =>
  new Date(Date.UTC(2026, 8, 20 + day, hour, 15));

/**
 * A family thread between every homeroom teacher and each of their students'
 * guardians, some answered, and a staff group of the school's teachers, so
 * every inbox opens on something.
 */
async function seedMessages(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  yearId: string,
) {
  const pairs = await tx.execute<{
    teacher_id: string;
    student_id: string;
    guardians: string;
  }>(sql`
    select t.user_id as teacher_id, s.user_id as student_id,
           coalesce((select array_agg(l.related_user_id order by l.related_user_id)
             from core.user_relationships l
             where l.tenant_id = s.tenant_id and l.student_user_id = s.user_id
               and l.status = 'active' and l.portal_access
               and not coalesce(l.communication_isolated, false))::text[], '{}')::text as guardians
    from core.classes c
    join core.enrollments t on t.tenant_id = c.tenant_id and t.class_id = c.id
      and t.role = 'teacher' and t.is_primary
    join core.enrollments s on s.tenant_id = c.tenant_id and s.class_id = c.id and s.role = 'student'
    where c.tenant_id = ${tenantId}::uuid and c.org_id = ${schoolId}::uuid
      and c.school_year_id = ${yearId}::uuid and c.class_type = 'homeroom'
    order by c.code, s.user_id`);
  const threads: (typeof messageThreads.$inferInsert)[] = [];
  const members: (typeof threadMembers.$inferInsert)[] = [];
  const posts: (typeof messages.$inferInsert)[] = [];
  for (const [index, pair] of pairs.entries()) {
    const guardians = pair.guardians
      .replace(/[{}]/g, "")
      .split(",")
      .filter(Boolean);
    if (guardians.length === 0) continue;
    const threadId = Bun.randomUUIDv7();
    const answered = index % 2 === 0;
    threads.push({
      tenantId,
      id: threadId,
      orgId: schoolId,
      kind: "family",
      studentUserId: pair.student_id,
      createdByUserId: pair.teacher_id,
      lastMessageAt: at(answered ? 2 : 1, 9),
    });
    members.push(
      {
        tenantId,
        threadId,
        userId: pair.teacher_id,
        role: "owner",
        joinedAt: at(1, 8),
        lastReadAt: at(2, 9),
      },
      ...guardians.map((userId) => ({
        tenantId,
        threadId,
        userId,
        joinedAt: at(1, 8),
        lastReadAt: answered ? at(2, 9) : null,
      })),
    );
    posts.push({
      tenantId,
      threadId,
      authorUserId: pair.teacher_id,
      body: "Welcome back. The first weeks went well; please check the timetable and the reading list for the term.",
      createdAt: at(1, 8),
    });
    if (answered)
      posts.push({
        tenantId,
        threadId,
        authorUserId: guardians[0] ?? pair.teacher_id,
        body: "Thank you. We have the reading list and will keep an eye on homework.",
        createdAt: at(2, 9),
      });
  }
  const staff = [...new Set(pairs.map((pair) => pair.teacher_id))];
  const [lead] = staff;
  if (lead && staff.length > 1) {
    const threadId = Bun.randomUUIDv7();
    threads.push({
      tenantId,
      id: threadId,
      orgId: schoolId,
      kind: "group",
      subject: "Homeroom teachers",
      createdByUserId: lead,
      lastMessageAt: at(3, 7),
    });
    members.push(
      ...staff.map((userId) => ({
        tenantId,
        threadId,
        userId,
        role: userId === lead ? ("owner" as const) : ("member" as const),
        joinedAt: at(3, 7),
        lastReadAt: userId === lead ? at(3, 7) : null,
      })),
    );
    posts.push({
      tenantId,
      threadId,
      authorUserId: lead,
      body: "Registers are due by 8:00 each morning. Shout here if a roster looks wrong.",
      createdAt: at(3, 7),
    });
  }
  for (let index = 0; index < threads.length; index += 200)
    await tx.insert(messageThreads).values(threads.slice(index, index + 200));
  for (let index = 0; index < members.length; index += 200)
    await tx.insert(threadMembers).values(members.slice(index, index + 200));
  for (let index = 0; index < posts.length; index += 200)
    await tx.insert(messages).values(posts.slice(index, index + 200));
  // Messages take the moment they are written; whoever had read them has
  // read them as written.
  await tx.execute(sql`
    update core.thread_members set last_read_at = statement_timestamp()
    where tenant_id = ${tenantId}::uuid and last_read_at is not null`);
}

/**
 * The daily register of every homeroom for the year's first two weeks, with
 * the odd absence and late arrival, some explained and some not, so the
 * office has something to follow up and families something to read.
 */
async function seedAttendance(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  yearId: string,
) {
  const roll = random(0x0a77e4d);
  const [categories, reasons] = await Promise.all([
    descriptorIds(tx, tenantId, "attendance_category"),
    descriptorIds(tx, tenantId, "attendance_reason"),
  ]);
  const days = await tx.execute<{ day_on: string }>(sql`
    select to_char(d.day_on, 'YYYY-MM-DD') as day_on from core.calendar_dates d
    join core.descriptors e on e.tenant_id = d.tenant_id and e.id = d.event_descriptor_id
    where d.tenant_id = ${tenantId}::uuid and d.school_year_id = ${yearId}::uuid
      and e.code_value = 'instructional_day' and d.day_on between ${YEAR.start}::date and '2026-09-24'::date
    order by d.day_on`);
  const [period] = await tx
    .select({ id: classPeriods.id })
    .from(classPeriods)
    .where(
      and(
        eq(classPeriods.tenantId, tenantId),
        eq(classPeriods.schoolYearId, yearId),
        eq(classPeriods.officialAttendance, true),
      ),
    )
    .limit(1);
  if (!period) throw new Error("no official attendance period");
  const homerooms = await tx.execute<{
    id: string;
    teacher_id: string;
    students: string;
  }>(sql`
    select c.id, t.user_id as teacher_id,
           coalesce((select array_agg(s.user_id order by s.user_id) from core.enrollments s
             where s.tenant_id = c.tenant_id and s.class_id = c.id and s.role = 'student'
               and s.status = 'active')::text[], '{}')::text as students
    from core.classes c
    join core.enrollments t on t.tenant_id = c.tenant_id and t.class_id = c.id
      and t.role = 'teacher' and t.is_primary
    where c.tenant_id = ${tenantId}::uuid and c.org_id = ${schoolId}::uuid
      and c.school_year_id = ${yearId}::uuid and c.class_type = 'homeroom'
    order by c.code`);
  const registers: (typeof attendanceRegisters.$inferInsert)[] = [];
  const events: (typeof attendanceEvents.$inferInsert)[] = [];
  for (const homeroom of homerooms) {
    const students = homeroom.students
      .replace(/[{}]/g, "")
      .split(",")
      .filter(Boolean);
    for (const { day_on: day } of days) {
      const registerId = Bun.randomUUIDv7();
      registers.push({
        tenantId,
        id: registerId,
        orgId: schoolId,
        classId: homeroom.id,
        classType: "homeroom",
        schoolYearId: yearId,
        classPeriodId: period.id,
        takenOn: day,
        state: "submitted",
        recordedByUserId: homeroom.teacher_id,
        submittedAt: new Date(`${day}T05:55:00Z`),
      });
      for (const studentId of students) {
        const chance = roll();
        const meaning =
          chance < 0.04
            ? "absent"
            : chance < 0.09
              ? "late"
              : chance < 0.1
                ? "excused"
                : "present";
        const explained =
          meaning === "excused" || (meaning !== "present" && roll() < 0.5);
        events.push({
          tenantId,
          takenOn: day,
          registerId,
          studentUserId: studentId,
          categoryDescriptorId: need(categories, meaning),
          categoryMeaning: meaning,
          reasonDescriptorId: explained
            ? need(reasons, meaning === "late" ? "transport" : "illness")
            : null,
          minutes: meaning === "late" ? 5 + Math.floor(roll() * 20) : null,
          recordedByUserId: homeroom.teacher_id,
        });
      }
    }
  }
  for (let index = 0; index < registers.length; index += 200)
    await tx
      .insert(attendanceRegisters)
      .values(registers.slice(index, index + 200));
  for (let index = 0; index < events.length; index += 500)
    await tx.insert(attendanceEvents).values(events.slice(index, index + 500));
}

async function seedHealth(
  tx: Tx,
  tenantId: string,
  studentId: string,
  context: { kek: KeyEncryptionKey; cell: string },
) {
  const [key] = await tx
    .select()
    .from(tenantKeys)
    .where(
      and(eq(tenantKeys.tenantId, tenantId), eq(tenantKeys.purpose, "health")),
    );
  if (!key) throw new Error("tenant has no health key");
  const dek = await context.kek.unwrap(new Uint8Array(key.wrappedDek), {
    cell: context.cell,
    tenantId,
    purpose: "health",
    keyVersion: key.keyVersion,
  });
  const kinds = await descriptorIds(tx, tenantId, "health_record_kind");
  await withPurpose(tx, "health", async (inner) => {
    for (const [kind, payload, alert] of [
      ["blood_group", { value: "O+" }, false],
      [
        "allergy",
        {
          text: "Peanuts",
          severity: "severe",
          action_plan: "EpiPen in the office",
        },
        true,
      ],
    ] as const) {
      const id = Bun.randomUUIDv7();
      const ciphertext = await encryptField(dek, JSON.stringify(payload), {
        tenantId,
        table: "health.records",
        column: "ciphertext",
        rowId: id,
        keyVersion: key.keyVersion,
      });
      await inner.insert(healthRecords).values({
        tenantId,
        id,
        studentUserId: studentId,
        kindDescriptorId: need(kinds, kind),
        hasAlert: alert,
        keyVersion: key.keyVersion,
        ciphertext: Buffer.from(ciphertext),
      });
    }
  });
  await tx
    .update(users)
    .set({ medicalAlert: true })
    .where(and(eq(users.tenantId, tenantId), eq(users.id, studentId)));
}

async function dataKey(
  tx: Tx,
  tenantId: string,
  purpose: "identifiers" | "identifier_lookup",
  context: { kek: KeyEncryptionKey; cell: string },
) {
  const [key] = await tx
    .select()
    .from(tenantKeys)
    .where(
      and(eq(tenantKeys.tenantId, tenantId), eq(tenantKeys.purpose, purpose)),
    );
  if (!key) throw new Error(`tenant has no ${purpose} key`);
  return {
    version: key.keyVersion,
    key: await context.kek.unwrap(new Uint8Array(key.wrappedDek), {
      cell: context.cell,
      tenantId,
      purpose,
      keyVersion: key.keyVersion,
    }),
  };
}

/**
 * An Egyptian national ID agreeing with the student's birth date, and a
 * passport running out soon, so the office sees both kinds of document and
 * the warning a passport near its end raises.
 */
async function seedIdentity(
  tx: Tx,
  tenantId: string,
  studentId: string,
  context: { kek: KeyEncryptionKey; cell: string },
) {
  const [student] = await tx
    .select({ birthDate: users.birthDate })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.id, studentId)));
  if (!student?.birthDate) return;
  const [identifiers, lookup] = await Promise.all([
    dataKey(tx, tenantId, "identifiers", context),
    dataKey(tx, tenantId, "identifier_lookup", context),
  ]);
  const systems = await descriptorIds(tx, tenantId, "external_id_system");
  const [year, month, day] = student.birthDate.split("-");
  const serial = String(
    Number.parseInt(studentId.replaceAll("-", "").slice(-6), 16) % 10_000,
  ).padStart(4, "0");
  const nationalId = `${year?.startsWith("20") ? "3" : "2"}${year?.slice(2)}${month}${day}01${serial}5`;
  const passport = `A${studentId.replaceAll("-", "").slice(-8).toUpperCase()}`;
  for (const [system, number, last4, until] of [
    ["national_id", nationalId, null, null],
    ["passport", passport, passport.slice(-4), "2026-11-21"],
  ] as const) {
    const id = Bun.randomUUIDv7();
    const ciphertext = await encryptField(identifiers.key, number, {
      tenantId,
      table: "core.external_ids",
      column: "identifier_ciphertext",
      rowId: id,
      keyVersion: identifiers.version,
    });
    await tx.insert(externalIds).values({
      tenantId,
      id,
      userId: studentId,
      systemDescriptorId: need(systems, system),
      systemMeaning: system,
      identifierCiphertext: Buffer.from(ciphertext),
      identifierHmac: Buffer.from(
        await lookupHmac(lookup.key, normaliseIdentifier(number)),
      ),
      identifierLast4: last4,
      keyVersion: identifiers.version,
      issuingCountryCode: "EG",
      validDuring: until ? `[2022-01-10,${until})` : "[2024-09-01,)",
    });
  }
}

export const SEED_TENANTS: {
  spec: TenantSpec;
  schools: SchoolPlan[];
  domain: string;
  seed: number;
}[] = [
  {
    spec: {
      kind: "school_group",
      nameEn: "Northwind Schools",
      nameAr: "مدارس جاما",
      defaultLocale: "ar",
      jurisdictions: ["EG"],
      schools: [
        {
          nameEn: "Northwind School",
          nameAr: "كلية جاما الدولية",
          timeZone: "Africa/Cairo",
          countryCode: "EG",
          defaultLocale: "en",
        },
        {
          nameEn: "Northwind East School",
          nameAr: "مدرسة جاما مصر الجديدة",
          timeZone: "Africa/Cairo",
          countryCode: "EG",
          defaultLocale: "ar",
        },
      ],
    },
    schools: [
      {
        slug: "northwind",
        nameEn: "Northwind School",
        nameAr: "كلية جاما الدولية",
        grades: ["grade_7", "grade_8", "grade_9"],
        studentsPerGrade: 6,
      },
      {
        slug: "northwind-east",
        nameEn: "Northwind East School",
        nameAr: "مدرسة جاما مصر الجديدة",
        grades: ["kg2", "grade_1", "grade_2"],
        studentsPerGrade: 5,
      },
    ],
    domain: "northwind.example.com",
    seed: 7,
  },
  {
    spec: {
      kind: "school",
      nameEn: "Acme School",
      nameAr: "مدرسة أكمي",
      defaultLocale: "en",
      jurisdictions: ["AE"],
      schools: [
        {
          nameEn: "Acme School",
          nameAr: "مدرسة أكمي",
          timeZone: "Asia/Dubai",
          countryCode: "AE",
          defaultLocale: "en",
        },
      ],
    },
    schools: [
      {
        slug: "acme",
        nameEn: "Acme School",
        nameAr: "مدرسة أكمي",
        grades: ["grade_5", "grade_6"],
        studentsPerGrade: 4,
      },
    ],
    domain: "acme.example.com",
    seed: 11,
  },
];

/**
 * The development seed: a school group of two schools, with a teacher who
 * works at both and a family with children at both, and a standalone school
 * in another jurisdiction. Every adult and some students can sign in with
 * `SEED_PASSWORD`.
 */
export async function seedCell(
  owner: ReturnType<typeof openOwner>,
  options: SeedOptions,
): Promise<SeededTenant[]> {
  const passwordHash = await Bun.password.hash(DEV_PASSWORD, {
    algorithm: "argon2id",
  });
  const result: SeededTenant[] = [];
  for (const plan of SEED_TENANTS) {
    const tenant = await provisionTenant(owner, plan.spec, options);
    const logins: SeededTenant["logins"] = [];
    const next = random(plan.seed);
    await owner.asOwner(tenant.tenantId, "seed", async (tx) => {
      const context: Parameters<typeof seedSchool>[4] = {
        passwordHash,
        next,
        kek: options.kek,
        cell: options.cell,
        domain: plan.domain,
        logins,
        shared: { reference: 1000 },
      };
      if (plan.spec.kind === "school_group") {
        const admin = person(["Salama", "سلامة"], ["Ashoush", "عشوش"], "male");
        await insertPerson(tx, tenant.tenantId, admin, {
          primaryOrgId: tenant.rootOrgId,
        });
        await role(
          tx,
          tenant.tenantId,
          admin.id,
          tenant.rootOrgId,
          "school_group",
          "district_administrator",
          "2020-01-01",
        );
        const login = `salama@${plan.domain}`;
        await giveAccount(tx, tenant.tenantId, admin.id, login, passwordHash);
        logins.push({
          role: "district_administrator",
          loginName: login,
          schoolId: null,
        });
      }
      for (const [index, school] of plan.schools.entries()) {
        const schoolId = tenant.schoolIds[index];
        if (!schoolId) throw new Error("school id missing");
        await seedSchool(tx, tenant, schoolId, school, context);
      }
    });
    result.push({
      ...tenant,
      spec: plan.spec,
      schools: plan.schools.map((school, index) => ({
        id: tenant.schoolIds[index] ?? "",
        slug: school.slug,
        nameEn: school.nameEn,
        nameAr: school.nameAr,
      })),
      logins,
    });
  }
  return result;
}

/**
 * A live, bilingual website: a home page and an about page published in both
 * languages, an admissions page still in draft, and news posts.
 */
async function seedSite(tx: Tx, tenantId: string, schoolId: string) {
  const [principal] = await tx.execute<{ user_id: string }>(sql`
    select r.user_id from core.user_roles r
    where r.tenant_id = ${tenantId}::uuid and r.org_id = ${schoolId}::uuid
      and r.role in ('principal', 'site_administrator') and r.status = 'active'
    order by r.role, r.user_id limit 1`);
  if (!principal) return;
  const userId = principal.user_id;
  await saveSiteSettings(tx, {
    tenantId,
    orgId: schoolId,
    expectedVersion: 0,
    live: true,
    primaryLocale: "en",
    bilingual: true,
    taglineEn: "Learning together, every day",
    taglineAr: "نتعلّم معًا كل يوم",
    socialLinks: [
      { kind: "facebook", url: "https://www.facebook.com/example" },
    ],
    bannerEn: "Open morning on 10 October: book a tour on the Visit page.",
    bannerAr: "صباح الأبواب المفتوحة يوم ١٠ أكتوبر: احجز جولة من صفحة الزيارة.",
    bannerTone: "info",
    bannerUntil: null,
    theme: { id: STARTERS.international.theme, palette: {}, fonts: {} },
    chrome: starterChrome(STARTERS.international.pages),
  });
  const news = await saveCategory(tx, {
    tenantId,
    orgId: schoolId,
    id: "",
    expectedVersion: 0,
    slug: "news",
    nameEn: "News",
    nameAr: "أخبار",
  });
  await saveCategory(tx, {
    tenantId,
    orgId: schoolId,
    id: "",
    expectedVersion: 0,
    slug: "events",
    nameEn: "Events",
    nameAr: "فعاليات",
  });

  const starter = STARTERS.international;
  const publishedAt = "2026-09-01T07:00:00.000Z";
  for (const [position, plan] of starter.pages.entries()) {
    const created = await insertPage(tx, {
      tenantId,
      orgId: schoolId,
      authorId: userId,
      parentId: null,
      slug: plan.slug,
      titleEn: plan.title[0],
      titleAr: plan.title[1],
      inMenu: true,
      isHome: plan.home ?? false,
    });
    const host = { type: "site_page", id: created.id };
    const built = buildTemplate(plan.template, "en");
    const content = { sections: built.content, description: "", reviewed: [] };
    const translation = {
      sections: built.translation,
      description: "",
      reviewed: built.translation.map((row) => row.id),
    };
    const original = await saveDocument(tx, {
      tenantId,
      orgId: schoolId,
      host,
      kind: "page",
      locale: "en",
      content,
      plainText: pagePlainText(content),
      mediaIds: [],
      userId,
    });
    const other = await saveTranslation(tx, {
      tenantId,
      orgId: schoolId,
      host,
      originalId: original.id,
      locale: "ar",
      kind: "page",
      content: translation,
      plainText: pagePlainText(translation),
      mediaIds: [],
      userId,
    });
    await setPageState(tx, {
      tenantId,
      id: created.id,
      expectedVersion: created.version,
      state: "published",
      publishedAt,
    });
    await snapshotPublish(tx, { tenantId, documentId: original.id, userId });
    await snapshotPublish(tx, { tenantId, documentId: other.id, userId });
    const page = {
      id: created.id,
      version: created.version + 1,
      orgId: schoolId,
      parentId: null,
      position,
      slug: plan.slug,
      isHome: plan.home ?? false,
      inMenu: true,
      titleEn: plan.title[0],
      titleAr: plan.title[1],
      state: "published" as const,
      publishedAt,
      revisedAt: null,
    };
    for (const locale of ["en", "ar"] as const)
      await writePublishedPage(tx, {
        tenantId,
        orgId: schoolId,
        page,
        locale,
        title: locale === "ar" ? plan.title[1] : plan.title[0],
        content: {
          sections: localizedSections(content, translation, "en", locale),
          description: "",
        },
        media: {},
        visibleFrom: publishedAt,
      });
  }

  const posts = [
    {
      slug: "welcome-back",
      titleEn: "Welcome back",
      titleAr: "أهلًا بعودتكم",
      excerptEn:
        "The new year has started, with new teachers and a new timetable.",
      excerptAr: "بدأ العام الجديد بمعلّمين جدد وجدول جديد.",
      bodyEn:
        "The new year has started smoothly. Thank you to every family for a calm first week.",
      bodyAr: "بدأ العام الجديد بهدوء. شكرًا لكل أسرة على أسبوع أول هادئ.",
      pinned: true,
      published: true,
    },
    {
      slug: "science-fair",
      titleEn: "Science fair winners",
      titleAr: "الفائزون في معرض العلوم",
      excerptEn:
        "Grade eight took first place with a water filter made from sand.",
      excerptAr: "فاز الصف الثامن بالمركز الأول بمرشّح ماء من الرمل.",
      bodyEn:
        "Grade eight took first place with a water filter made from sand and charcoal.",
      bodyAr: "فاز الصف الثامن بالمركز الأول بمرشّح ماء من الرمل والفحم.",
      pinned: false,
      published: true,
    },
    {
      slug: "sports-day",
      titleEn: "Sports day",
      titleAr: "",
      excerptEn: "Sports day is on 20 November.",
      excerptAr: "",
      bodyEn: "Sports day is on 20 November, with races for every grade.",
      bodyAr: "",
      pinned: false,
      published: false,
    },
  ];
  for (const plan of posts) {
    const created = await insertPost(tx, {
      tenantId,
      orgId: schoolId,
      authorId: userId,
      categoryId: news?.id ?? null,
      slug: plan.slug,
      titleEn: plan.titleEn,
      titleAr: plan.titleAr,
      excerptEn: plan.excerptEn,
      excerptAr: plan.excerptAr,
      coverFileId: null,
      coverAltEn: "",
      coverAltAr: "",
      pinned: plan.pinned,
      visibility: "public",
    });
    const host = { type: "site_post", id: created.id };
    const english = plainContent(plan.bodyEn);
    const original = await saveDocument(tx, {
      tenantId,
      orgId: schoolId,
      host,
      kind: "rich_text",
      locale: "en",
      content: english as unknown as Record<string, unknown>,
      plainText: plan.bodyEn,
      mediaIds: [],
      userId,
    });
    const arabic = plan.bodyAr ? plainContent(plan.bodyAr) : null;
    const other = arabic
      ? await saveTranslation(tx, {
          tenantId,
          orgId: schoolId,
          host,
          originalId: original.id,
          locale: "ar",
          kind: "rich_text",
          content: arabic as unknown as Record<string, unknown>,
          plainText: plan.bodyAr,
          mediaIds: [],
          userId,
        })
      : null;
    if (!plan.published) continue;
    await setPostState(tx, {
      tenantId,
      id: created.id,
      expectedVersion: created.version,
      state: "published",
      publishedAt,
    });
    await snapshotPublish(tx, { tenantId, documentId: original.id, userId });
    if (other) {
      await snapshotPublish(tx, { tenantId, documentId: other.id, userId });
      await reviewTranslation(tx, {
        tenantId,
        host: "site_post",
        id: created.id,
        userId,
        reviewed: true,
      });
    }
    const post = {
      id: created.id,
      version: created.version + 1,
      orgId: schoolId,
      categoryId: news?.id ?? null,
      slug: plan.slug,
      titleEn: plan.titleEn,
      titleAr: plan.titleAr,
      excerptEn: plan.excerptEn,
      excerptAr: plan.excerptAr,
      coverFileId: null,
      coverAltEn: "",
      coverAltAr: "",
      pinned: plan.pinned,
      state: "published" as const,
      visibility: "public" as const,
      primaryLocale: "en" as const,
      publishedAt,
      revisedAt: null,
      authorNameEn: null,
      authorNameAr: null,
    };
    for (const locale of ["en", "ar"] as const) {
      const translated = locale === "ar" && arabic;
      await writePublishedPost(tx, {
        tenantId,
        orgId: schoolId,
        post,
        locale,
        title: (locale === "ar" ? plan.titleAr : plan.titleEn) || plan.titleEn,
        excerpt:
          (locale === "ar" ? plan.excerptAr : plan.excerptEn) || plan.excerptEn,
        coverKey: null,
        coverAlt: "",
        content: {
          body: translated ? arabic : english,
          locale: translated ? "ar" : "en",
        },
        media: {},
        visibleFrom: publishedAt,
      });
    }
  }
  const [admissions] = await tx.execute<{ id: string }>(sql`
    select id from core.site_pages
    where tenant_id = ${tenantId}::uuid and org_id = ${schoolId}::uuid and slug = 'admissions'
      and status = 'active'`);
  for (const enquiry of [
    {
      name: "Salama Ashoush",
      email: "salama.family@example.com",
      phone: "+971 50 000 0001",
      childYear: "Grade 2",
      message:
        "We are moving to the city in January. Is there a place in grade 2?",
      purpose: "enquiry" as const,
      locale: "en" as const,
    },
    {
      name: "سلامة عشوش",
      email: "family.ar@example.com",
      phone: "",
      childYear: "الروضة الأولى",
      message: "نرغب في زيارة المدرسة صباح يوم الخميس.",
      purpose: "visit" as const,
      locale: "ar" as const,
    },
  ])
    await insertEnquiry(tx, {
      tenantId,
      orgId: schoolId,
      pageId: admissions?.id ?? null,
      sectionId: null,
      networkKey: "",
      ...enquiry,
    });
}
