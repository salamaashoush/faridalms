import { plainContent } from "@faridalms/domain/content-conversion";
import { CATALOGUE } from "@faridalms/domain/descriptors/catalogue";
import { addDays, teachingWeeks } from "@faridalms/domain/school";
import { schoolDays } from "@faridalms/domain/timetable";
import { and, eq, sql } from "drizzle-orm";

import type { CellTransaction, openOwner } from "./context";
import type { KeyEncryptionKey } from "./crypto";
import type { ProvisionedTenant, TenantSpec } from "./tenants";

import { withPurpose } from "./context";
import { encryptField } from "./crypto";
import { newUserHandle } from "./stores/accounts";
import {
  academicSessions,
  academicWeeks,
  attendanceRegisters,
  assessments,
  assignmentRecipients,
  assignments,
  accessRoleAssignments,
  accessRoles,
  accounts,
  calendarDates,
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
  householdMembers,
  households,
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
        dueAt: new Date("2026-10-22T12:00:00Z"),
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
        household: string;
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
      let household = shared?.household ?? "";
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
        household = Bun.randomUUIDv7();
        await tx.insert(households).values({
          tenantId,
          id: household,
          nameEn: `${family[0]} family`,
          nameAr: `عائلة ${family[1]}`,
          primaryLanguage: "ar",
        });
        await tx.insert(householdMembers).values(
          [mother, father].map((adult) => ({
            tenantId,
            householdId: household,
            userId: adult.id,
            memberKind: "adult" as const,
            validDuring: "[2024-09-01,)",
          })),
        );
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
          context.shared.siblingsOf = { mother, father, family, household };
      }
      await tx.insert(householdMembers).values({
        tenantId,
        householdId: household,
        userId: student.id,
        memberKind: "child",
        validDuring: "[2024-09-01,)",
      });
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
          livesWith: true,
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
      if (grade === "grade_8" && index === 0) {
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
