import type { ContentDocument } from "@faridalms/domain/content";
import type { LessonBlock, LessonCompletion } from "@faridalms/domain/learning";
import type { ModuleId } from "@faridalms/domain/modules";
import type { FormQuestion } from "@faridalms/domain/questions";

import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import {
  headedContent,
  plainContent,
} from "@faridalms/domain/content-conversion";
import { CATALOGUE } from "@faridalms/domain/descriptors/catalogue";
import { normaliseIdentifier } from "@faridalms/domain/identifiers";
import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { BASIC_MODULES, MODULE_IDS } from "@faridalms/domain/modules";
import {
  formDocument,
  formQuestions,
  readFormAnswers,
} from "@faridalms/domain/questions";
import { addDays, schoolDate, teachingWeeks } from "@faridalms/domain/school";
import { dayOpen, schoolDays } from "@faridalms/domain/school-days";
import {
  buildTemplate,
  STARTERS,
  starterChrome,
} from "@faridalms/domain/site-templates";
import { DEFAULT_PERIODS } from "@faridalms/domain/timetable";
import {
  blankPage,
  localizedSections,
  pagePlainText,
} from "@faridalms/domain/website";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { CellTransaction, openOwner } from "./context";
import type { KeyEncryptionKey } from "./crypto";
import type { Audience } from "./stores/audiences";
import type { ProvisionedTenant, TenantSpec } from "./tenants";

import { withPurpose } from "./context";
import { encryptField, lookupHmac } from "./crypto";
import { newUserHandle } from "./stores/accounts";
import { decideApplication } from "./stores/admission-decisions";
import {
  insertApplication,
  insertApplicationEntry,
  insertForm as insertAdmissionForm,
  insertIntake,
  markSubmitted as markApplicationSubmitted,
  openApplicantRole,
  publishForm as publishAdmissionForm,
  setApplicationState,
} from "./stores/admissions";
import {
  audienceUsers,
  setAudiences,
  studentsHeardFor,
} from "./stores/audiences";
import {
  addRecipients,
  insertBroadcast,
  setBroadcastState,
} from "./stores/broadcasts";
import {
  enrolledStudents,
  insertAnswer,
  insertForm,
  publishForm,
} from "./stores/consents";
import {
  saveDocument,
  saveTranslation,
  snapshotPublish,
} from "./stores/documents";
import { insertEnquiry, openEnquiryConversation } from "./stores/enquiries";
import { actorsOf, keepConsentLink, setToFamilies } from "./stores/families";
import {
  addHomeroom,
  followHomeroom,
  linkClass,
  placeMember,
} from "./stores/homerooms";
import { setIntakeGrade } from "./stores/intake-grades";
import { setIntakeYear } from "./stores/intake-years";
import {
  insertLesson,
  insertModule,
  recordProgress,
  setModuleClasses,
  setModuleState,
} from "./stores/learning";
import { postMessage } from "./stores/messages";
import { insertDeliveries, insertNotifications } from "./stores/notifications";
import { setOrgFeature } from "./stores/school";
import {
  insertPage,
  saveCategory,
  saveSiteSettings,
  setPageState,
  writePublishedPage,
  keepSitePost,
  writePublishedPost,
} from "./stores/site";
import { uuidArray } from "./stores/sql";
import { reviewTranslation } from "./stores/translations";
import {
  academicSessions,
  academicWeeks,
  attendanceRegisters,
  assessments,
  assignmentRecipients,
  assignments,
  broadcastAudiences,
  broadcasts,
  accessRoleAssignments,
  accessRoles,
  accounts,
  calendarDates,
  calendarEventAudiences,
  calendarEvents,
  classGroupMembers,
  classGroups,
  classYears,
  classGrades,
  classes,
  classMeetings,
  timetables,
  classPeriods,
  registerPeriods,
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
  assignmentTerms,
  periodGrades,
  siteEnquiries,
  rubrics,
  studentGrades,
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
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Name = [en: string, ar: string];

export const GIRLS: Name[] = [
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
export const BOYS: Name[] = [
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
export const FAMILIES: Name[] = [
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
export const MOTHERS: Name[] = [
  ["Amira", "أميرة"],
  ["Heba", "هبة"],
  ["Mona", "منى"],
  ["Rania", "رانيا"],
  ["Sara", "سارة"],
  ["Noha", "نهى"],
  ["Dalia", "داليا"],
  ["Ghada", "غادة"],
];

/** The family who enquires and applies, in the seeded admissions office. */
export interface Visitor {
  given: Name;
  family: Name;
  child: Name;
}

const DEV_VISITOR: Visitor = {
  given: ["Salama", "سلامة"],
  family: ["Ashoush", "عشوش"],
  child: ["Omar", "عمر"],
};

const emailName = (visitor: Visitor) => visitor.given[0].toLowerCase();

export interface Names {
  girls: readonly Name[];
  boys: readonly Name[];
  families: readonly Name[];
  mothers: readonly Name[];
}

const DEV_NAMES: Names = {
  girls: GIRLS,
  boys: BOYS,
  families: FAMILIES,
  mothers: MOTHERS,
};

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
  /**
   * What its plan entitles it to: every module, so the seed shows the whole
   * product, but Basic for one school and core's teaching modules alone for
   * the academy.
   */
  modules: readonly ModuleId[];
}

export interface SeededTenant extends ProvisionedTenant {
  spec: TenantSpec;
  schools: SeededSchool[];
  /** Login names by role, for tests and for signing in during development. */
  logins: { role: string; loginName: string; schoolId: string | null }[];
}

export const SEED_PASSWORD = DEV_PASSWORD;

export type Tx = CellTransaction;

export async function descriptorIds(
  tx: Tx,
  tenantId: string,
  namespace: string,
) {
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

export const need = <K, V>(map: Map<K, V>, key: K): V => {
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

export const YEAR: YearPlan = {
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

/** The dev schools' rooms, or rooms enough for a homeroom each. */
function roomCodes(homerooms: number) {
  if (homerooms <= 6) return ["101", "102", "103", "104", "201", "202"];
  return Array.from(
    { length: homerooms },
    (_, index) =>
      `${Math.floor(index / 10) + 1}${String((index % 10) + 1).padStart(2, "0")}`,
  );
}

async function seedYear(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  homerooms: number,
) {
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
    titleAr: "2026–2027",
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
  const days: (typeof calendarDates.$inferInsert)[] = [];
  for (const holiday of YEAR.holidays)
    for (let day = holiday.start; day < holiday.end; day = addDays(day, 1))
      if (!weekendDays.includes(isoWeekday(day)))
        days.push({
          tenantId,
          orgId: schoolId,
          dayOn: day,
          eventDescriptorId: need(events, holiday.code),
          noteEn: holiday.en,
          noteAr: holiday.ar,
        });
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
  await tx.insert(classPeriods).values(
    DEFAULT_PERIODS.map((period, index) => ({
      tenantId,
      orgId: schoolId,
      code: period.code,
      nameEn: period.nameEn,
      nameAr: period.nameAr,
      sequence: index + 1,
      kind: period.kind,
      startTime: period.startTime,
      endTime: period.endTime,
      officialAttendance: period.official,
      weekdays: [...period.weekdays],
      validDuring: `[${YEAR.start},)`,
    })),
  );
  await tx.insert(locations).values(
    [...roomCodes(homerooms), "Lab 1", "Library"].map((code) => ({
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
            ? "المعمل 1"
            : `الغرفة ${code}`,
      capacity: code === "Library" ? 60 : 30,
    })),
  );
  return { yearId };
}

export interface Person {
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
  secret: { passwordHash: string; reachable: boolean },
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
    secretHash: secret.passwordHash,
    secretSetAt: new Date(),
    linkMethod: "admin",
  });
  await tx
    .update(users)
    .set({ username: loginName })
    .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
  if (!secret.reachable) return accountId;
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

export interface SchoolPlan {
  slug: string;
  grades: string[];
  studentsPerGrade: number;
  /** Homerooms per grade, A, B and on; one unless given. */
  sections?: number;
  /**
   * Each class teacher also teaches one subject to their own class, as in a
   * real school; otherwise class teachers are taken from the staff in turn.
   */
  classTeacherTeaches?: boolean;
  basic?: boolean;
  /** An admissions office with next year's intakes and applications. */
  admissions?: boolean;
}

interface NamedSchoolPlan extends SchoolPlan {
  nameEn: string;
  nameAr: string;
}

const TAUGHT_SUBJECTS = ["arabic", "english", "mathematics", "science"];

const SECTIONS: Name[] = [
  ["A", "أ"],
  ["B", "ب"],
  ["C", "ج"],
  ["D", "د"],
];

// The timetable rotates a homeroom's subjects one step on from the homeroom
// before it, so a block of as many homerooms as there are subjects never
// needs one subject at the same time twice. Each block has its own subject
// teachers, and no teacher is ever in two rooms at once.
const BLOCK = TAUGHT_SUBJECTS.length;

/** Six teachers for a small school, or a subject teacher per block. */
function teacherCount(homerooms: number) {
  return Math.max(6, BLOCK * Math.ceil(homerooms / BLOCK));
}

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
 * Homerooms for each grade with their class teachers, and four subject
 * classes taught to each by subject specialists, so a teacher reaches only
 * the grades they teach. Students are enrolled in their homeroom for the
 * year; `pupils` holds each grade's students by section.
 */
async function seedClasses(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  yearId: string,
  grades: readonly string[],
  teachers: readonly Person[],
  pupils: ReadonlyMap<string, readonly (readonly string[])[]>,
  classTeacherTeaches = false,
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
  let homeroomIndex = 0;
  for (const grade of grades) {
    const short = gradeShort(grade);
    const courseIds = new Map<string, string>();
    for (const [section, students] of (pupils.get(grade) ?? [[]]).entries()) {
      const [letter, letterAr] = SECTIONS[section] ?? ["A", "أ"];
      const block = Math.floor(homeroomIndex / BLOCK);
      const homeroomId = Bun.randomUUIDv7();
      await tx.insert(classes).values({
        tenantId,
        id: homeroomId,
        orgId: schoolId,
        runs: span,
        code: `${short}-${letter}`,
        titleEn: `${short}${letter}`,
        titleAr: `${gradeShortAr(grade)} ${letterAr}`,
      });
      await tx.insert(classGrades).values({
        tenantId,
        orgId: schoolId,
        classId: homeroomId,
        gradeLevelDescriptorId: need(gradeIds, grade),
      });
      await tx.insert(classYears).values({
        tenantId,
        orgId: schoolId,
        classId: homeroomId,
        schoolYearId: yearId,
      });
      await addHomeroom(tx, { tenantId, orgId: schoolId, classId: homeroomId });
      await tx.insert(enrollments).values({
        tenantId,
        classId: homeroomId,
        orgId: schoolId,
        validDuring: span,
        source: "manual",
        userId: teacherOf(
          classTeacherTeaches
            ? (homeroomIndex % BLOCK) + 1 + block * BLOCK
            : homeroomIndex,
        ).id,
        role: "teacher",
        isPrimary: true,
        classroomPositionDescriptorId: need(positions, "teacher_of_record"),
      });
      for (const studentId of students)
        await placeMember(tx, {
          tenantId,
          orgId: schoolId,
          homeroomClassId: homeroomId,
          studentId,
          from: YEAR.start,
          endsBefore: YEAR.end,
          source: "manual",
        });
      for (const [subjectIndex, subject] of TAUGHT_SUBJECTS.entries()) {
        const names = subjectNames.get(subject);
        let courseId = courseIds.get(subject);
        if (!courseId) {
          courseId = Bun.randomUUIDv7();
          await tx.insert(courses).values({
            tenantId,
            id: courseId,
            orgId: schoolId,
            code: `${subject.toUpperCase().slice(0, 4)}-${short}`,
            titleEn: `${names?.en ?? subject} ${short}`,
            titleAr: `${names?.ar ?? subject} ${gradeShortAr(grade)}`,
            subjectDescriptorId: need(subjectIds, subject),
          });
          courseIds.set(subject, courseId);
        }
        const classId = Bun.randomUUIDv7();
        await tx.insert(classes).values({
          tenantId,
          id: classId,
          orgId: schoolId,
          runs: span,
          code: `${short}-${letter}-${subject.toUpperCase().slice(0, 4)}`,
          titleEn: `${short}${letter} ${names?.en ?? subject}`,
          titleAr: `${gradeShortAr(grade)} ${letterAr} ${names?.ar ?? subject}`,
          courseId,
          subjectDescriptorId: need(subjectIds, subject),
        });
        await tx.insert(classGrades).values({
          tenantId,
          orgId: schoolId,
          classId,
          gradeLevelDescriptorId: need(gradeIds, grade),
        });
        await tx.insert(classYears).values({
          tenantId,
          orgId: schoolId,
          classId,
          schoolYearId: yearId,
        });
        await linkClass(tx, {
          tenantId,
          orgId: schoolId,
          homeroomClassId: homeroomId,
          classId,
          linkedOn: YEAR.start,
        });
        await tx.insert(enrollments).values({
          tenantId,
          classId,
          orgId: schoolId,
          userId: teacherOf(subjectIndex + 1 + block * BLOCK).id,
          role: "teacher",
          isPrimary: true,
          classroomPositionDescriptorId: need(positions, "teacher_of_record"),
          validDuring: span,
          source: "manual",
        });
      }
      await followHomeroom(tx, { tenantId, homeroomClassId: homeroomId });
      homeroomIndex += 1;
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
    teacher_id: string;
    title_en: string | null;
  }>(sql`
    select c.id, e.user_id as teacher_id, c.title_en
    from core.classes c
    join core.enrollments e on e.tenant_id = c.tenant_id and e.class_id = c.id and e.role = 'teacher'
    where c.tenant_id = ${tenantId}::uuid and c.id in (select y.class_id from core.class_years y where y.tenant_id = c.tenant_id and y.school_year_id = ${yearId}::uuid and y.status = 'active')
      and c.subject_descriptor_id is not null
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
      where tenant_id = ${tenantId}::uuid and class_id = ${offering.id}::uuid
        and role = 'student'
      order by user_id`);
    const students = roster.map((row) => row.user_id);
    const base = {
      tenantId,
      orgId: schoolId,
      classId: offering.id,
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
    if (term)
      await tx.insert(assignmentTerms).values(
        [dueId, laterId, draftId].map((assignmentId) => ({
          tenantId,
          assignmentId,
          gradingPeriodId: term.id,
        })),
      );
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
          gradingPeriodId: term.id,
          studentUserId,
          score: 70 + ((position * 4) % 30),
          recordedByUserId: offering.teacher_id,
          releasedAt: new Date("2026-09-26T10:00:00Z"),
        })),
      );
  }
}

/** What a school's own content is written against, once its people and classes exist. */
export interface FilledSchool {
  tenantId: string;
  schoolId: string;
  yearId: string;
  principalId: string;
  officeId: string;
  teachers: readonly Person[];
  /** Each grade's students, by section. */
  pupils: ReadonlyMap<string, readonly (readonly string[])[]>;
  kek: KeyEncryptionKey;
  cell: string;
  next: () => number;
}

export async function seedSchool(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  plan: SchoolPlan,
  context: {
    passwordHash: string;
    visitor: Visitor;
    /**
     * Writes the school's coursework, lessons, messages, announcements and
     * events in place of the development seed's few examples.
     */
    content?: (tx: Tx, school: FilledSchool) => Promise<void>;
    /** Whether a seeded login is also an address the school writes to. */
    reachable: boolean;
    names: Names;
    /** The last day whose registers are taken, YYYY-MM-DD. */
    attendanceUntil: string;
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
  const { next, names } = context;
  const sections = plan.sections ?? 1;
  const homerooms = plan.grades.length * sections;
  const pick = <T>(list: readonly T[]): T => {
    const value = list[Math.floor(next() * list.length)];
    if (value === undefined) throw new Error("empty list");
    return value;
  };
  // The office's own address and number, which the portal's help and the
  // website's contact section both read from the school's profile.
  await tx.execute(sql`
    update core.orgs set email = ${`office@${context.domain}`},
      phone = ${"+20 2 2735 0100"}
    where tenant_id = ${tenantId}::uuid and id = ${schoolId}::uuid`);
  const { yearId } = await seedYear(tx, tenantId, schoolId, homerooms);
  const positions = await descriptorIds(tx, tenantId, "staff_position");
  const grades = await descriptorIds(tx, tenantId, "grade_level");
  const relations = await descriptorIds(tx, tenantId, "relation");
  const entries = await descriptorIds(tx, tenantId, "school_entry_type");
  const idSystems = await descriptorIds(tx, tenantId, "external_id_system");

  const principal = person(pick(names.mothers), pick(names.families), "female");
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
  await giveAccount(tx, tenantId, principal.id, principalLogin, context);
  context.logins.push({
    role: "principal",
    loginName: principalLogin,
    schoolId,
  });

  const office = person(pick(names.boys), pick(names.families), "male");
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
  await giveAccount(tx, tenantId, office.id, officeLogin, context);
  context.logins.push({ role: "staff", loginName: officeLogin, schoolId });

  const teachers: Person[] = [];
  for (let index = 0; index < teacherCount(homerooms); index += 1) {
    const sex = index % 2 === 0 ? "female" : "male";
    const teacher = person(
      pick(sex === "female" ? names.mothers : names.boys),
      pick(names.families),
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
    await giveAccount(tx, tenantId, teacher.id, login, context);
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

  const pupils = new Map<string, string[][]>();
  for (const grade of plan.grades) {
    for (let index = 0; index < plan.studentsPerGrade; index += 1) {
      const shared =
        index === 0 && grade === plan.grades[0]
          ? context.shared.siblingsOf
          : undefined;
      const family = shared?.family ?? pick(names.families);
      const sex = next() < 0.5 ? "female" : "male";
      const student = person(
        pick(sex === "female" ? names.girls : names.boys),
        family,
        sex,
      );
      const birthYear = 2026 - ageInSeptember(grade);
      await insertPerson(tx, tenantId, student, {
        primaryOrgId: schoolId,
        birthDate: `${birthYear}-0${1 + Math.floor(next() * 9)}-1${Math.floor(next() * 9)}`,
        birthDateSource: "school_record",
      });
      const bySection =
        pupils.get(grade) ??
        Array.from({ length: sections }, (): string[] => []);
      bySection[index % sections]?.push(student.id);
      pupils.set(grade, bySection);
      await tx.insert(studentSchoolYears).values({
        tenantId,
        studentUserId: student.id,
        orgId: schoolId,
        schoolYearId: yearId,
        validDuring: `[${YEAR.start},${YEAR.end})`,
        entryTypeDescriptorId: need(entries, "continuing"),
        source: "manual",
      });
      await tx.insert(studentGrades).values({
        tenantId,
        orgId: schoolId,
        studentUserId: student.id,
        gradeLevelDescriptorId: need(grades, grade),
        validDuring: `[${YEAR.start},)`,
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
        shared?.mother ??
        person(pick(names.mothers), pick(names.families), "female");
      const father = shared?.father ?? person(pick(names.boys), family, "male");
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
            smsCapable: context.reachable,
            source: "manual",
          });
        const motherLogin = `parent${reference}@${context.domain}`;
        await giveAccount(tx, tenantId, mother.id, motherLogin, context);
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
        await giveAccount(tx, tenantId, student.id, studentLogin, context);
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
  const [officer] = await tx
    .select({ id: accessRoles.id })
    .from(accessRoles)
    .where(
      and(
        eq(accessRoles.tenantId, tenantId),
        eq(accessRoles.builtinKey, "admissions_officer"),
      ),
    );
  if (officer)
    await tx.insert(accessRoleAssignments).values({
      tenantId,
      userId: office.id,
      accessRoleId: officer.id,
      orgId: schoolId,
      validDuring: "[2026-09-01,)",
      grantedByUserId: principal.id,
      reason: "Answers the families who enquire.",
    });
  await seedClasses(
    tx,
    tenantId,
    schoolId,
    yearId,
    plan.grades,
    teachers,
    pupils,
    plan.classTeacherTeaches,
  );
  // Everything below joins the people and classes just written, in this same
  // transaction, before autovacuum has counted any of them. Without counts
  // the planner takes a school of hundreds for a handful, and its audience
  // and guardian queries outlast a statement's limit on a small server.
  await tx.execute(sql`
    analyze core.users, core.user_roles, core.user_relationships,
      core.enrollments, core.classes`);
  await seedTimetable(tx, tenantId, schoolId, yearId);
  if (context.content) {
    await seedAttendance(
      tx,
      tenantId,
      schoolId,
      yearId,
      context.attendanceUntil,
    );
    await context.content(tx, {
      tenantId,
      schoolId,
      yearId,
      principalId: principal.id,
      officeId: office.id,
      teachers,
      pupils,
      kek: context.kek,
      cell: context.cell,
      next,
    });
    await seedConsents(
      tx,
      tenantId,
      schoolId,
      (pupils.get(plan.grades[1] ?? "") ?? []).flat(),
    );
  } else {
    await seedCoursework(tx, tenantId, schoolId, yearId);
    await seedAttendance(
      tx,
      tenantId,
      schoolId,
      yearId,
      context.attendanceUntil,
    );
    await seedMessages(tx, tenantId, schoolId, yearId);
    await seedAnnouncements(tx, tenantId, schoolId);
    await seedNewsletters(tx, tenantId, schoolId);
    await seedConsents(
      tx,
      tenantId,
      schoolId,
      (pupils.get(plan.grades[1] ?? "") ?? []).flat(),
    );
    await seedEvents(tx, tenantId, schoolId, yearId);
    await seedNotifications(tx, tenantId, schoolId);
    await seedLearning(tx, tenantId, schoolId, yearId);
  }
  await seedSite(tx, tenantId, schoolId, context.visitor);
  await seedEnquiries(tx, tenantId, schoolId, office.id, context.visitor);
  if (plan.admissions)
    await seedAdmissions(tx, tenantId, schoolId, {
      passwordHash: context.passwordHash,
      reachable: context.reachable,
      visitor: context.visitor,
      login: `applicant.${plan.slug}@${context.domain}`,
      logins: context.logins,
      officeId: office.id,
    });
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
        eq(classPeriods.orgId, schoolId),
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
    select c.id, k.homeroom_class_id, e.user_id as teacher_id
    from core.homeroom_classes k
    join core.classes c on c.tenant_id = k.tenant_id and c.id = k.class_id
    join core.enrollments e on e.tenant_id = c.tenant_id and e.class_id = c.id
      and e.role = 'teacher' and e.is_primary
    join core.classes h on h.tenant_id = k.tenant_id and h.id = k.homeroom_class_id
    where k.tenant_id = ${tenantId}::uuid and k.org_id = ${schoolId}::uuid
      and c.id in (select y.class_id from core.class_years y where y.tenant_id = c.tenant_id and y.school_year_id = ${yearId}::uuid and y.status = 'active') and k.status = 'active'
    order by h.code, c.code`);
  const homerooms = [...new Set(offered.map((row) => row.homeroom_class_id))];
  const [timetable] = await tx
    .insert(timetables)
    .values({
      tenantId,
      orgId: schoolId,
      startsOn: YEAR.start,
      cycleKind: "weeks",
      cycleLength: 1,
    })
    .returning({ id: timetables.id });
  if (!timetable) throw new Error("no seeded timetable");
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
          timetableId: timetable.id,
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
  await insertAnnouncements(
    tx,
    { tenantId, schoolId, authorId: principal.user_id, on: "2026-09-27" },
    [
      {
        title: "Welcome to the new school year",
        body: "Registers open at 7:45 each morning. The timetable and the reading lists for the term are in the app.",
        audience: { scope: "school", classId: null },
        urgency: "normal",
        pinnedUntil: "2027-06-18",
        publishAt: new Date("2026-09-13T06:00:00Z"),
      },
      {
        title: "Museum trip permission",
        body: "The museum trip is on 15 October. Please acknowledge that your child may join by 8 October.",
        audience: { scope: "families", classId: null },
        urgency: "important",
        requiresAck: true,
        ackDueOn: "2026-10-08",
        publishAt: new Date("2026-09-24T09:00:00Z"),
      },
      {
        title: "Parents' evening",
        body: "Parents' evening dates will follow once teachers confirm their slots.",
        audience: { scope: "families", classId: null },
        urgency: "normal",
        publishAt: null,
      },
    ],
  );
}

/** An audience the seed writes: the school's own, or the families of every student. */
export type SeedAudience = Audience | { scope: "families"; classId: null };

const ownAudience = (audience: SeedAudience): Audience | null =>
  audience.scope === "families" ? null : audience;

/**
 * Everyone seeded audiences reach on a day, as the API's would with every
 * module on: the school's own, those who act for the students of the
 * school's and a class's audiences, and the families of every student.
 */
async function seededPeople(
  tx: Tx,
  input: { tenantId: string; schoolId: string; on: string },
  audiences: readonly SeedAudience[],
): Promise<string[]> {
  const own = audiences.flatMap((audience) => ownAudience(audience) ?? []);
  const [people, heard] = await Promise.all([
    audienceUsers(tx, input, own),
    studentsHeardFor(tx, input, own),
  ]);
  const everyone = audiences.some((audience) => audience.scope === "families")
    ? await enrolledStudents(tx, {
        tenantId: input.tenantId,
        schoolId: input.schoolId,
        today: input.on,
      })
    : [];
  const actors = await actorsOf(tx, {
    tenantId: input.tenantId,
    studentIds: [...new Set([...heard, ...everyone])],
    on: input.on,
    purpose: "contact",
  });
  return [...new Set([...people, ...actors.map((link) => link.userId)])];
}

export interface AnnouncementPlan {
  title: string;
  body: string;
  audience: SeedAudience;
  urgency: "normal" | "important";
  pinnedUntil?: string;
  requiresAck?: boolean;
  ackDueOn?: string;
  publishAt: Date | null;
}

/** Announcements by one author, each reaching its audience as it stood `on` that day. */
export async function insertAnnouncements(
  tx: Tx,
  input: { tenantId: string; schoolId: string; authorId: string; on: string },
  plans: readonly AnnouncementPlan[],
) {
  const { tenantId, schoolId, on } = input;
  for (const plan of plans) {
    const id = Bun.randomUUIDv7();
    await tx.insert(broadcasts).values({
      tenantId,
      id,
      orgId: schoolId,
      titleEn: plan.title,
      urgency: plan.urgency,
      state: plan.publishAt ? "published" : "draft",
      publishAt: plan.publishAt,
      toldAt: plan.publishAt,
      pinnedUntil: plan.pinnedUntil ?? null,
      requiresAck: plan.requiresAck ?? false,
      ackDueOn: plan.ackDueOn ?? null,
      authorUserId: input.authorId,
    });
    const own = ownAudience(plan.audience);
    if (own)
      await tx.insert(broadcastAudiences).values({
        tenantId,
        broadcastId: id,
        scope: own.scope,
      });
    else
      await setToFamilies(tx, {
        tenantId,
        kind: "broadcast",
        id,
        on: true,
      });
    const words = await saveDocument(tx, {
      tenantId,
      orgId: schoolId,
      host: { type: "announcement", id },
      kind: "rich_text",
      locale: "en",
      content: plainContent(plan.body) as unknown as Record<string, unknown>,
      plainText: plan.body,
      mediaIds: [],
      userId: input.authorId,
    });
    if (plan.publishAt) {
      await snapshotPublish(tx, {
        tenantId,
        documentId: words.id,
        userId: input.authorId,
      });
      await addRecipients(tx, {
        tenantId,
        broadcastId: id,
        userIds: await seededPeople(tx, { tenantId, schoolId, on }, [
          plan.audience,
        ]),
      });
    }
  }
}

/** What a seeded announcement leaves unset, as the editor would. */
const unsetFields = {
  titleAr: "",
  urgency: "normal" as const,
  pinnedUntil: null,
  expiresOn: null,
  requiresAck: false,
  ackDueOn: null,
  excerptEn: "",
  excerptAr: "",
  coverFileId: null,
  coverAltEn: "",
  coverAltAr: "",
};

const part = (heading: string, body: string) => ({
  heading,
  body: plainContent(body),
});

/**
 * September's newsletter sent to the school in both languages, the Arabic
 * not yet checked against the English, and October's still a draft. Both
 * are for the school only, never the website.
 */
async function seedNewsletters(tx: Tx, tenantId: string, schoolId: string) {
  const [principal] = await tx.execute<{ user_id: string }>(sql`
    select r.user_id from core.user_roles r
    where r.tenant_id = ${tenantId}::uuid and r.org_id = ${schoolId}::uuid
      and r.role in ('principal', 'site_administrator') and r.status = 'active'
    order by r.role, r.user_id limit 1`);
  if (!principal) return;
  await insertNewsletters(
    tx,
    { tenantId, schoolId, authorId: principal.user_id, on: "2026-09-27" },
    [
      {
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
            "رحلة المتحف في 15 أكتوبر، ويليها لقاء أولياء الأمور في نهاية الشهر.",
          ),
          part(
            "الأندية",
            "تبدأ أندية الشطرنج والروبوتات والكورال الأسبوع المقبل.",
          ),
        ]),
      },
      {
        title: "October newsletter",
        publishAt: null,
        english: headedContent([
          part("From the principal", "Notes for October will follow."),
        ]),
        arabic: null,
      },
    ],
  );
}

export interface NewsletterPlan {
  title: string;
  publishAt: Date | null;
  english: ContentDocument;
  arabic: ContentDocument | null;
}

/** Newsletters to the whole school by one author, the published told to everyone `on` that day. */
export async function insertNewsletters(
  tx: Tx,
  input: { tenantId: string; schoolId: string; authorId: string; on: string },
  plans: readonly NewsletterPlan[],
) {
  const { tenantId, schoolId } = input;
  const audience: Audience = { scope: "school", classId: null };
  for (const plan of plans) {
    const created = await insertBroadcast(tx, {
      ...unsetFields,
      tenantId,
      schoolId,
      authorId: input.authorId,
      titleEn: plan.title,
    });
    await setAudiences(tx, {
      tenantId,
      owner: { kind: "broadcast", id: created.id },
      audiences: [audience],
    });
    const host = { type: "announcement", id: created.id };
    const original = await saveDocument(tx, {
      tenantId,
      orgId: schoolId,
      host,
      kind: "rich_text",
      locale: "en",
      content: plan.english as unknown as Record<string, unknown>,
      plainText: contentPlainText(plan.english),
      mediaIds: [],
      userId: input.authorId,
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
          userId: input.authorId,
        })
      : null;
    if (!plan.publishAt) continue;
    await setBroadcastState(tx, {
      tenantId,
      id: created.id,
      expectedVersion: created.version,
      state: "published",
      publishAt: plan.publishAt.toISOString(),
      told: "now",
    });
    for (const document of [original, translation])
      if (document)
        await snapshotPublish(tx, {
          tenantId,
          documentId: document.id,
          userId: input.authorId,
        });
    await addRecipients(tx, {
      tenantId,
      broadcastId: created.id,
      userIds: await seededPeople(tx, { tenantId, schoolId, on: input.on }, [
        audience,
      ]),
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
      code: "admission_processing",
      publish: true,
      english: headedContent([
        part(
          "What we are asking",
          "May the school use what you write in this application, and the documents you upload, to consider your child for a place?",
        ),
        part(
          "How long we keep it",
          "If your child does not join the school, we delete the application after the period in our privacy notice.",
        ),
        part(
          "Changing your mind",
          "You can withdraw the application at any time from your account.",
        ),
      ]),
      arabic: headedContent([
        part(
          "ما نطلبه",
          "هل تسمح للمدرسة باستخدام ما تكتبه في هذا الطلب وما ترفعه من مستندات للنظر في قبول طفلك؟",
        ),
        part(
          "مدة الاحتفاظ",
          "إن لم يلتحق طفلك بالمدرسة نحذف الطلب بعد المدة المذكورة في إشعار الخصوصية.",
        ),
        part("تغيير رأيك", "يمكنك سحب الطلب في أي وقت من حسابك."),
      ]),
    },
    {
      code: "admission_special_category",
      publish: true,
      english: headedContent([
        part(
          "What we are asking",
          "May the school read what you tell us about your child's health and needs, so we can plan the right support?",
        ),
      ]),
      arabic: headedContent([
        part(
          "ما نطلبه",
          "هل تسمح للمدرسة بالاطلاع على ما تخبرنا به عن صحة طفلك واحتياجاته، حتى نخطط للدعم المناسب؟",
        ),
      ]),
    },
    {
      code: "admission_marketing",
      publish: true,
      english: headedContent([
        part(
          "What we are asking",
          "May we email you news and open days of the school while you apply?",
        ),
      ]),
      arabic: headedContent([
        part(
          "ما نطلبه",
          "هل نرسل إليك بالبريد أخبار المدرسة وأيامها المفتوحة أثناء التقديم؟",
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
  // A school filled for a demonstration may have written a form of its own;
  // that purpose keeps it.
  const asked = new Set(
    (
      await tx.execute<{ purpose_descriptor_id: string }>(sql`
        select purpose_descriptor_id from core.privacy_notices
        where tenant_id = ${tenantId}::uuid and org_id = ${schoolId}::uuid
          and status = 'active'`)
    ).map((row) => row.purpose_descriptor_id),
  );
  const noticeOf = new Map<string, string>();
  for (const form of forms) {
    if (asked.has(need(purposes, form.code))) continue;
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
    const consentId = await insertAnswer(tx, {
      tenantId,
      studentId,
      purposeId: need(purposes, "photo_school_website"),
      decision: agreed ? "granted" : "refused",
      noticeId: website,
      givenById: mother.related_user_id,
      capacity: "guardian",
      method: agreed ? "electronic" : "verbal_recorded",
      evidenceFileId: null,
      recordedById: agreed ? mother.related_user_id : principal.user_id,
      givenOn: "2026-09-20",
      ageAtDecision: null,
      refreshDueOn: null,
      note: agreed ? null : "Told the office at pickup.",
    });
    await keepConsentLink(tx, {
      tenantId,
      consentId,
      relationshipId: mother.id,
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
    select c.id from core.homerooms h
    join core.classes c on c.tenant_id = h.tenant_id and c.id = h.class_id
    where h.tenant_id = ${tenantId}::uuid and c.id in (select y.class_id from core.class_years y where y.tenant_id = c.tenant_id and y.school_year_id = ${yearId}::uuid and y.status = 'active')
      and c.title_en = '8A' and c.status = 'active'`);
  if (!principal) return;
  const school: Audience = { scope: "school", classId: null };
  const families: SeedAudience = {
    scope: "families",
    classId: null,
  };
  const staff: Audience = { scope: "staff", classId: null };
  await insertEvents(tx, { tenantId, schoolId, authorId: principal.user_id }, [
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
      audiences: eight ? [{ scope: "class", classId: eight.id }] : [families],
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
    {
      title: "Sports day",
      titleAr: "اليوم الرياضي",
      public: true,
      category: "sport",
      startsOn: "2027-06-10",
      startTime: "08:00",
      endTime: "12:00",
      location: "Sports field",
      audiences: [school],
      body: "Races, relays and a picnic. Families are welcome to watch.",
    },
  ]);
}

export interface EventPlan {
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
  audiences: SeedAudience[];
  body: string;
}

/** Calendar events by one author, each described and published. */
export async function insertEvents(
  tx: Tx,
  input: { tenantId: string; schoolId: string; authorId: string },
  plans: readonly EventPlan[],
) {
  const { tenantId, schoolId } = input;
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
      authorUserId: input.authorId,
    });
    const own = plan.audiences.flatMap(
      (audience) => ownAudience(audience) ?? [],
    );
    if (own.length > 0)
      await tx.insert(calendarEventAudiences).values(
        own.map((audience) => ({
          tenantId,
          eventId: id,
          scope: audience.scope,
          classId: audience.classId,
        })),
      );
    if (own.length < plan.audiences.length)
      await setToFamilies(tx, {
        tenantId,
        kind: "calendar_event",
        id,
        on: true,
      });
    const description = await saveDocument(tx, {
      tenantId,
      orgId: schoolId,
      host: { type: "calendar_event", id },
      kind: "rich_text",
      content: plainContent(plan.body) as unknown as Record<string, unknown>,
      plainText: plan.body,
      mediaIds: [],
      userId: input.authorId,
    });
    await snapshotPublish(tx, {
      tenantId,
      documentId: description.id,
      userId: input.authorId,
    });
  }
}

/**
 * The trip notice waiting on each family it reached, with the email the
 * development cell could not send for want of a gateway.
 */
export async function seedNotifications(
  tx: Tx,
  tenantId: string,
  schoolId: string,
) {
  const rows = await tx.execute<{
    id: string;
    title: string;
    user_id: string;
  }>(sql`
    select a.id, a.title_en as title, r.user_id from core.broadcasts a
    join core.broadcast_recipients r on r.tenant_id = a.tenant_id and r.broadcast_id = a.id
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
    select c.id, e.user_id as teacher_id from core.homerooms h
    join core.classes c on c.tenant_id = h.tenant_id and c.id = h.class_id
    join core.enrollments e on e.tenant_id = c.tenant_id and e.class_id = c.id
      and e.role = 'teacher' and e.status = 'active'
    where h.tenant_id = ${tenantId}::uuid and c.id in (select y.class_id from core.class_years y where y.tenant_id = c.tenant_id and y.school_year_id = ${yearId}::uuid and y.status = 'active')
      and c.status = 'active'
    order by (c.title_en = '8A') desc, c.code, e.user_id limit 1`);
  if (!homeroom) return;
  const [student] = await tx.execute<{ user_id: string }>(sql`
    select user_id from core.enrollments
    where tenant_id = ${tenantId}::uuid and class_id = ${homeroom.id}::uuid
      and role = 'student' and status = 'active'
    order by user_id limit 1`);
  const quizId = Bun.randomUUIDv7();
  const right = Bun.randomUUIDv7();
  const plans: {
    title: string;
    summary: string;
    published: boolean;
    lessons: {
      title: string;
      completion: LessonCompletion;
      blocks: LessonBlock[];
    }[];
  }[] = [
    {
      title: "Reading stories together",
      summary: "How stories are built, with a short check and a reflection.",
      published: true,
      lessons: [
        {
          title: "What makes a story",
          completion: "view",
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
          completion: "quiz",
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
          completion: "reflection",
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
          completion: "mark",
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
      const content = contentOfLesson({ version: 2, blocks: lesson.blocks });
      if (!content) throw new Error(`${lesson.title} cannot be a document`);
      const document = await saveDocument(tx, {
        tenantId,
        orgId: schoolId,
        host: { type: "lesson", id: row.id },
        kind: "lesson",
        content: { ...content },
        plainText: contentPlainText(content),
        mediaIds: contentFileIds(content),
        userId: homeroom.teacher_id,
      });
      if (plan.published)
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
               and app.guardian_permits(l, ${YEAR.start}::date, 'contact'))::text[], '{}')::text as guardians
    from core.homerooms h
    join core.classes c on c.tenant_id = h.tenant_id and c.id = h.class_id
    join core.enrollments t on t.tenant_id = c.tenant_id and t.class_id = c.id
      and t.role = 'teacher' and t.is_primary
    join core.enrollments s on s.tenant_id = c.tenant_id and s.class_id = c.id and s.role = 'student'
    where h.tenant_id = ${tenantId}::uuid and h.org_id = ${schoolId}::uuid
      and c.id in (select y.class_id from core.class_years y where y.tenant_id = c.tenant_id and y.school_year_id = ${yearId}::uuid and y.status = 'active')
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
  // What each message says is its document, as the composer saves it. A
  // school filled for a demonstration may already have conversations of its
  // own, whose documents are frozen and stay as they are.
  const seeded = uuidArray(threads.map((thread) => thread.id ?? ""));
  const written = await tx.execute<{
    id: string;
    body: string;
    author_user_id: string | null;
  }>(sql`
    select x.id, x.body, x.author_user_id from core.messages x
    where x.tenant_id = ${tenantId}::uuid and x.thread_id = any(${seeded})`);
  for (const row of written)
    await saveDocument(tx, {
      tenantId,
      orgId: schoolId,
      host: { type: "message", id: row.id },
      content: plainContent(row.body) as unknown as Record<string, unknown>,
      plainText: row.body,
      mediaIds: [],
      userId: row.author_user_id,
      frozen: true,
    });
  // Messages take the moment they are written; whoever had read them has
  // read them as written.
  await tx.execute(sql`
    update core.thread_members set last_read_at = statement_timestamp()
    where tenant_id = ${tenantId}::uuid and thread_id = any(${seeded})
      and last_read_at is not null`);
}

/**
 * The daily register of every homeroom from the year's start, with
 * the odd absence and late arrival, some explained and some not, so the
 * office has something to follow up and families something to read.
 */
async function seedAttendance(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  yearId: string,
  until: string,
) {
  const roll = random(0x0a77e4d);
  const [categories, reasons] = await Promise.all([
    descriptorIds(tx, tenantId, "attendance_category"),
    descriptorIds(tx, tenantId, "attendance_reason"),
  ]);
  const [school] = await tx
    .select({ weekStart: orgs.weekStart, weekendDays: orgs.weekendDays })
    .from(orgs)
    .where(and(eq(orgs.tenantId, tenantId), eq(orgs.id, schoolId)));
  if (!school) throw new Error("no seeded school");
  const marked = await tx.execute<{ day_on: string; meaning: string }>(sql`
    select to_char(d.day_on, 'YYYY-MM-DD') as day_on, e.system_meaning as meaning
    from core.calendar_dates d
    join core.descriptors e on e.tenant_id = d.tenant_id and e.id = d.event_descriptor_id
    where d.tenant_id = ${tenantId}::uuid and d.org_id = ${schoolId}::uuid
      and d.status = 'active'`);
  const marks = new Map(marked.map((row) => [row.day_on, row.meaning]));
  const days: { day_on: string }[] = [];
  for (let day = YEAR.start; day <= until; day = addDays(day, 1))
    if (dayOpen(school, day, marks.get(day) ?? null))
      days.push({ day_on: day });
  const [period] = await tx
    .select({ id: classPeriods.id })
    .from(classPeriods)
    .where(
      and(
        eq(classPeriods.tenantId, tenantId),
        eq(classPeriods.orgId, schoolId),
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
    from core.homerooms h
    join core.classes c on c.tenant_id = h.tenant_id and c.id = h.class_id
    join core.enrollments t on t.tenant_id = c.tenant_id and t.class_id = c.id
      and t.role = 'teacher' and t.is_primary
    where h.tenant_id = ${tenantId}::uuid and h.org_id = ${schoolId}::uuid
      and c.id in (select y.class_id from core.class_years y where y.tenant_id = c.tenant_id and y.school_year_id = ${yearId}::uuid and y.status = 'active')
    order by c.code`);
  const registers: (typeof attendanceRegisters.$inferInsert)[] = [];
  const taken: (typeof registerPeriods.$inferInsert)[] = [];
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
        kind: "period",
        daily: true,
        takenOn: day,
        state: "submitted",
        recordedByUserId: homeroom.teacher_id,
        submittedAt: new Date(`${day}T05:55:00Z`),
      });
      taken.push({
        tenantId,
        orgId: schoolId,
        registerId,
        classId: homeroom.id,
        takenOn: day,
        classPeriodId: period.id,
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
  for (let index = 0; index < taken.length; index += 200)
    await tx.insert(registerPeriods).values(taken.slice(index, index + 200));
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

/**
 * A school of courses for adults, entitled to the modules it names and to
 * nothing of a school of children: no years, grades, homerooms or families.
 */
interface AcademyPlan {
  kind: "academy";
  slug: string;
  nameEn: string;
  nameAr: string;
  modules: readonly ModuleId[];
}

type SeedSchoolPlan = NamedSchoolPlan | AcademyPlan;

interface AcademyPerson {
  given: Name;
  family: Name;
  sex: "female" | "male";
  born: string;
}

const ACADEMY_TEACHERS: AcademyPerson[] = [
  {
    given: ["Heba", "هبة"],
    family: ["Rashad", "رشاد"],
    sex: "female",
    born: "1987-03-14",
  },
  {
    given: ["Seif", "سيف"],
    family: ["Nasser", "ناصر"],
    sex: "male",
    born: "1990-08-02",
  },
  {
    given: ["Ghada", "غادة"],
    family: ["Farouk", "فاروق"],
    sex: "female",
    born: "1984-11-27",
  },
];

const ACADEMY_LEARNERS: AcademyPerson[] = [
  {
    given: ["Nour", "نور"],
    family: ["Saleh", "صالح"],
    sex: "female",
    born: "1996-04-12",
  },
  {
    given: ["Karim", "كريم"],
    family: ["Mansour", "منصور"],
    sex: "male",
    born: "1991-11-03",
  },
  {
    given: ["Yasmin", "ياسمين"],
    family: ["Farouk", "فاروق"],
    sex: "female",
    born: "1999-07-21",
  },
  {
    given: ["Tarek", "طارق"],
    family: ["Hamdy", "حمدي"],
    sex: "male",
    born: "1988-02-09",
  },
  {
    given: ["Salma", "سلمى"],
    family: ["Nasser", "ناصر"],
    sex: "female",
    born: "2001-05-30",
  },
  {
    given: ["Ziad", "زياد"],
    family: ["Rashad", "رشاد"],
    sex: "male",
    born: "1994-09-14",
  },
  {
    given: ["Dina", "دينا"],
    family: ["Helmy", "حلمي"],
    sex: "female",
    born: "1985-12-02",
  },
  {
    given: ["Hamza", "حمزة"],
    family: ["Zaki", "زكي"],
    sex: "male",
    born: "2003-03-25",
  },
  {
    given: ["Laila", "ليلى"],
    family: ["Sabry", "صبري"],
    sex: "female",
    born: "1997-08-08",
  },
  {
    given: ["Mostafa", "مصطفى"],
    family: ["Kamel", "كامل"],
    sex: "male",
    born: "1990-06-17",
  },
  {
    given: ["Aya", "آية"],
    family: ["Wahba", "وهبة"],
    sex: "female",
    born: "2002-10-05",
  },
  {
    given: ["Khaled", "خالد"],
    family: ["Fathy", "فتحي"],
    sex: "male",
    born: "1993-01-28",
  },
];

/**
 * A class of the academy: a run of one of its courses, from a start date
 * and, unless it keeps enrolling, to an end. Days count from the seed's
 * today; learners are numbered from one, each joining a number of days
 * after the class starts.
 */
interface AcademyClass {
  code: string;
  titleEn: string;
  titleAr: string;
  course: string;
  room: string;
  teacher: number;
  starts: number;
  ends: number | null;
  learners: [learner: number, joins: number][];
}

const ACADEMY_COURSES: { code: string; en: string; ar: string }[] = [
  { code: "PY-FOUND", en: "Python Foundations", ar: "أساسيات بايثون" },
  { code: "WEB-DEV", en: "Web Development", ar: "تطوير الويب" },
  {
    code: "DATA-PY",
    en: "Data Analysis with Python",
    ar: "تحليل البيانات ببايثون",
  },
];

const ACADEMY_CLASSES: AcademyClass[] = [
  {
    code: "PY-EVE",
    titleEn: "Python Foundations, evenings",
    titleAr: "أساسيات بايثون، مسائي",
    course: "PY-FOUND",
    room: "lab-1",
    teacher: 1,
    starts: -140,
    ends: null,
    learners: [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 80],
      [5, 119],
      [6, 119],
    ],
  },
  {
    code: "WEB-AUT",
    titleEn: "Web Development, autumn cohort",
    titleAr: "تطوير الويب، دفعة الخريف",
    course: "WEB-DEV",
    room: "lab-2",
    teacher: 2,
    starts: -42,
    ends: 70,
    learners: [
      [5, 0],
      [7, 0],
      [8, 0],
      [9, 0],
      [10, 0],
      [11, 0],
    ],
  },
  {
    code: "WEB-SPR",
    titleEn: "Web Development, spring cohort",
    titleAr: "تطوير الويب، دفعة الربيع",
    course: "WEB-DEV",
    room: "lab-2",
    teacher: 2,
    starts: -230,
    ends: -110,
    learners: [
      [2, 0],
      [6, 0],
      [10, 0],
      [12, 0],
    ],
  },
  {
    code: "DATA-WIN",
    titleEn: "Data Analysis with Python, winter cohort",
    titleAr: "تحليل البيانات ببايثون، دفعة الشتاء",
    course: "DATA-PY",
    room: "lab-1",
    teacher: 3,
    starts: 24,
    ends: 108,
    learners: [
      [3, 0],
      [4, 0],
      [12, 0],
    ],
  },
];

/**
 * Work set in a class, days from the seed's today: what each numbered
 * learner handed in, how many days after it was due (late when positive),
 * and the score and words it came back with, if it has.
 */
interface AcademyWork {
  classCode: string;
  title: string;
  brief: string;
  points: number;
  opens: number;
  due: number | null;
  handedIn: {
    learner: number;
    after: number;
    answer: string;
    returned?: { score: number; feedback: string | null };
  }[];
}

const ACADEMY_WORK: AcademyWork[] = [
  {
    classCode: "PY-EVE",
    title: "Variables and types",
    brief:
      "Write a program that stores your name, your age and your favourite number, then prints a sentence using all three.",
    points: 10,
    opens: -30,
    due: -23,
    handedIn: [
      {
        learner: 1,
        after: -2,
        answer: 'name = "Nour"\nage = 30\nprint(f"{name} is {age}")',
        returned: { score: 9, feedback: "Clear names and a tidy f-string." },
      },
      {
        learner: 2,
        after: -1,
        answer: 'name = "Karim"\nprint("Karim is " + 35)',
        returned: {
          score: 7,
          feedback: "Joining text to a number needs str() first.",
        },
      },
      {
        learner: 3,
        after: -1,
        answer: 'favourite = 7\nprint("My number is", favourite)',
      },
      {
        learner: 4,
        after: 3,
        answer: 'age = "thirty-eight"\nprint(age)',
      },
    ],
  },
  {
    classCode: "PY-EVE",
    title: "Loops: FizzBuzz",
    brief:
      "Print the numbers from 1 to 100, but Fizz for multiples of three, Buzz for multiples of five and FizzBuzz for both.",
    points: 20,
    opens: -9,
    due: 5,
    handedIn: [
      {
        learner: 1,
        after: -6,
        answer:
          'for n in range(1, 101):\n    print("Fizz" * (n % 3 == 0) + "Buzz" * (n % 5 == 0) or n)',
      },
    ],
  },
  {
    classCode: "PY-EVE",
    title: "Functions practice",
    brief: "Write three small functions and a test for each.",
    points: 10,
    opens: 0,
    due: null,
    handedIn: [],
  },
  {
    classCode: "WEB-AUT",
    title: "A page about yourself",
    brief:
      "Build one HTML page with a heading, a photo, a list of three things you enjoy and a link to a site you use every day.",
    points: 10,
    opens: -28,
    due: -14,
    handedIn: [
      {
        learner: 5,
        after: -3,
        answer:
          "<h1>Salma</h1>\n<ul><li>Running</li><li>Chess</li><li>Baking</li></ul>",
        returned: { score: 8, feedback: "Add alt text to the photo." },
      },
      {
        learner: 7,
        after: -2,
        answer:
          "<h1>Dina Helmy</h1>\n<p>I enjoy reading, gardens and maps.</p>",
        returned: {
          score: 10,
          feedback: "Every part is there, and it reads well.",
        },
      },
      {
        learner: 8,
        after: -1,
        answer: "<h1>Hamza</h1>",
        returned: {
          score: 6,
          feedback: "The list and the link are still to come.",
        },
      },
      {
        learner: 9,
        after: -1,
        answer:
          '<h1>Laila</h1>\n<a href="https://example.com">My daily read</a>',
      },
      {
        learner: 11,
        after: 1,
        answer:
          "<h1>Aya</h1>\n<ol><li>Drawing</li><li>Music</li><li>Tea</li></ol>",
      },
    ],
  },
  {
    classCode: "WEB-AUT",
    title: "Style it with CSS",
    brief:
      "Give your page a colour scheme, a readable font and a layout that works on a phone.",
    points: 20,
    opens: -7,
    due: 7,
    handedIn: [],
  },
  {
    classCode: "WEB-SPR",
    title: "Final project: a small shop site",
    brief:
      "Build a three-page site for a small shop: a home page, a product list and a contact form.",
    points: 50,
    opens: -150,
    due: -117,
    handedIn: [
      {
        learner: 2,
        after: -1,
        answer: "A bakery with its menu and opening hours.",
        returned: { score: 42, feedback: "A real shop could use this." },
      },
      {
        learner: 6,
        after: 0,
        answer: "A bicycle repair shop with a booking form.",
        returned: { score: 38, feedback: "The form needs labels." },
      },
      {
        learner: 10,
        after: -2,
        answer: "A bookshop with search by author.",
        returned: { score: 46, feedback: "Thoughtful navigation throughout." },
      },
      {
        learner: 12,
        after: 1,
        answer: "A plant nursery with care guides.",
        returned: {
          score: 35,
          feedback: "Handed in a day late; the care guides are lovely.",
        },
      },
    ],
  },
];

/** A learning module of the academy, set for one class, with who has done which lesson. */
interface AcademyModule {
  classCode: string;
  title: string;
  summary: string;
  published: boolean;
  lessons: { title: string; text: string; doneBy: number[] }[];
}

const ACADEMY_MODULES: AcademyModule[] = [
  {
    classCode: "PY-EVE",
    title: "Python basics",
    summary: "From a first print to names, values and decisions.",
    published: true,
    lessons: [
      {
        title: "Your first program",
        text: 'A program is a list of instructions. print("Hello") shows a word on the screen.',
        doneBy: [1, 2, 3, 4],
      },
      {
        title: "Names and values",
        text: "A variable is a name for a value. age = 30 keeps the number 30 under the name age.",
        doneBy: [1, 2, 3],
      },
      {
        title: "Making decisions",
        text: "if, elif and else choose what runs, by whether a condition is true.",
        doneBy: [1],
      },
    ],
  },
  {
    classCode: "WEB-AUT",
    title: "HTML from the ground up",
    summary: "Elements, attributes and the shape of a page.",
    published: true,
    lessons: [
      {
        title: "Elements and tags",
        text: "Every part of a page is an element, opened and closed by a tag.",
        doneBy: [5, 7, 8, 9],
      },
      {
        title: "Links and images",
        text: "An a element links to another page; an img element shows a picture and says what it shows in its alt text.",
        doneBy: [7],
      },
    ],
  },
  {
    classCode: "DATA-WIN",
    title: "First steps with pandas",
    summary: "Reading a table, choosing columns and counting.",
    published: false,
    lessons: [
      {
        title: "Reading a CSV file",
        text: "pandas.read_csv turns a file of rows into a table you can ask questions of.",
        doneBy: [],
      },
    ],
  },
];

/**
 * A coding academy of adults on core and the teaching modules alone: its
 * courses run as classes from their own dates, one still enrolling, one
 * over and one yet to start; teachers and a dozen learners who sign in
 * for themselves; work handed in, marked and returned; lessons and the
 * progress through them; each running class's register for the last
 * school days; and messages and announcements.
 */
async function seedAcademy(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  plan: AcademyPlan,
  context: {
    passwordHash: string;
    domain: string;
    today: string;
    logins: SeededTenant["logins"];
  },
) {
  const { today, domain } = context;
  const day = (offset: number) => addDays(today, offset);
  const moment = (offset: number, hour: number) =>
    new Date(`${day(offset)}T${String(hour).padStart(2, "0")}:00:00Z`);
  const [positions, classroom, subjects, idSystems, categories, reasons] =
    await Promise.all([
      descriptorIds(tx, tenantId, "staff_position"),
      descriptorIds(tx, tenantId, "classroom_position"),
      descriptorIds(tx, tenantId, "subject"),
      descriptorIds(tx, tenantId, "external_id_system"),
      descriptorIds(tx, tenantId, "attendance_category"),
      descriptorIds(tx, tenantId, "attendance_reason"),
    ]);
  await tx.execute(sql`
    update core.orgs set email = ${`office@${domain}`},
      phone = ${"+20 2 2735 0199"}
    where tenant_id = ${tenantId}::uuid and id = ${schoolId}::uuid`);
  await setOrgFeature(tx, {
    tenantId,
    orgId: schoolId,
    feature: "elearning",
    enabled: true,
  });
  const account = async (who: Person, login: string, held: string) => {
    await giveAccount(tx, tenantId, who.id, login, {
      passwordHash: context.passwordHash,
      reachable: true,
    });
    context.logins.push({ role: held, loginName: login, schoolId });
  };

  const admin = person(["Amira", "أميرة"], ["Helmy", "حلمي"], "female");
  await insertPerson(tx, tenantId, admin, { primaryOrgId: schoolId });
  await role(
    tx,
    tenantId,
    admin.id,
    schoolId,
    "school",
    "site_administrator",
    "2023-01-08",
  );
  await account(admin, `admin.${plan.slug}@${domain}`, "site_administrator");

  const teachers: Person[] = [];
  for (const [index, each] of ACADEMY_TEACHERS.entries()) {
    const teacher = person(each.given, each.family, each.sex);
    await insertPerson(tx, tenantId, teacher, {
      primaryOrgId: schoolId,
      birthDate: each.born,
      birthDateSource: "school_record",
    });
    await role(
      tx,
      tenantId,
      teacher.id,
      schoolId,
      "school",
      "teacher",
      "2023-01-08",
      { positionDescriptorId: need(positions, "teacher") },
    );
    await account(
      teacher,
      `teacher${index + 1}.${plan.slug}@${domain}`,
      "teacher",
    );
    teachers.push(teacher);
  }

  const learners: Person[] = [];
  for (const [index, each] of ACADEMY_LEARNERS.entries()) {
    const learner = person(each.given, each.family, each.sex);
    await insertPerson(tx, tenantId, learner, {
      primaryOrgId: schoolId,
      birthDate: each.born,
      birthDateSource: "document",
    });
    await role(
      tx,
      tenantId,
      learner.id,
      schoolId,
      "school",
      "student",
      day(-240),
    );
    await tx.insert(externalIds).values({
      tenantId,
      userId: learner.id,
      systemDescriptorId: need(idSystems, "school_reference"),
      systemMeaning: "school_reference",
      identifier: `LF${1001 + index}`,
      assigningOrgId: schoolId,
      validDuring: `[${day(-240)},)`,
    });
    await account(
      learner,
      `student${index + 1}.${plan.slug}@${domain}`,
      "student",
    );
    learners.push(learner);
  }
  const teacherOf = (number: number) => {
    const found = teachers[number - 1];
    if (!found) throw new Error(`no academy teacher ${number}`);
    return found;
  };
  const learnerOf = (number: number) => {
    const found = learners[number - 1];
    if (!found) throw new Error(`no academy learner ${number}`);
    return found;
  };

  const rooms = new Map<string, string>();
  for (const [code, en, ar] of [
    ["lab-1", "Lab 1", "المعمل 1"],
    ["lab-2", "Lab 2", "المعمل 2"],
  ] as const) {
    const id = Bun.randomUUIDv7();
    await tx.insert(locations).values({
      tenantId,
      id,
      orgId: schoolId,
      kind: "lab",
      code,
      nameEn: en,
      nameAr: ar,
      capacity: 16,
    });
    rooms.set(code, id);
  }
  const courseIds = new Map<string, string>();
  for (const course of ACADEMY_COURSES) {
    const id = Bun.randomUUIDv7();
    await tx.insert(courses).values({
      tenantId,
      id,
      orgId: schoolId,
      code: course.code,
      titleEn: course.en,
      titleAr: course.ar,
      subjectDescriptorId: need(subjects, "computing"),
    });
    courseIds.set(course.code, id);
  }

  const classIds = new Map<string, string>();
  for (const each of ACADEMY_CLASSES) {
    const id = Bun.randomUUIDv7();
    const ends = each.ends === null ? "" : day(each.ends);
    await tx.insert(classes).values({
      tenantId,
      id,
      orgId: schoolId,
      runs: `[${day(each.starts)},${ends})`,
      code: each.code,
      titleEn: each.titleEn,
      titleAr: each.titleAr,
      courseId: need(courseIds, each.course),
      subjectDescriptorId: need(subjects, "computing"),
      locationId: need(rooms, each.room),
    });
    classIds.set(each.code, id);
    await tx.insert(enrollments).values([
      {
        tenantId,
        classId: id,
        orgId: schoolId,
        userId: teacherOf(each.teacher).id,
        role: "teacher" as const,
        isPrimary: true,
        classroomPositionDescriptorId: need(classroom, "teacher_of_record"),
        validDuring: `[${day(each.starts)},${ends})`,
        source: "manual" as const,
      },
      ...each.learners.map(([learner, joins]) => ({
        tenantId,
        classId: id,
        orgId: schoolId,
        userId: learnerOf(learner).id,
        role: "student" as const,
        validDuring: `[${day(each.starts + joins)},${ends})`,
        source: "manual" as const,
      })),
    ]);
  }
  const classOf = (code: string) => {
    const id = need(classIds, code);
    const found = ACADEMY_CLASSES.find((each) => each.code === code);
    if (!found) throw new Error(`no academy class ${code}`);
    return { id, run: found, teacher: teacherOf(found.teacher) };
  };
  const inClassOn = (run: AcademyClass, on: string) =>
    run.learners
      .filter(([, joins]) => day(run.starts + joins) <= on)
      .map(([learner]) => learnerOf(learner).id);

  for (const work of ACADEMY_WORK) {
    const { id: classId, run, teacher } = classOf(work.classCode);
    const id = Bun.randomUUIDv7();
    const published = work.due !== null;
    await tx.insert(assignments).values({
      tenantId,
      id,
      orgId: schoolId,
      classId,
      authorUserId: teacher.id,
      title: work.title,
      state: published ? "published" : "draft",
      availableFrom: moment(work.opens, 6),
      dueAt: work.due === null ? null : moment(work.due, 20),
      points: work.points,
      publishedAt: published ? moment(work.opens, 6) : null,
    });
    await tx.insert(documents).values({
      tenantId,
      hostType: "assignment",
      hostId: id,
      orgId: schoolId,
      kind: "rich_text",
      schemaVersion: 1,
      content: plainContent(work.brief) as unknown as Record<string, unknown>,
      plainText: work.brief,
    });
    if (!published) continue;
    const recipients = inClassOn(run, day(work.opens));
    await tx.insert(assignmentRecipients).values(
      recipients.map((studentUserId) => ({
        tenantId,
        assignmentId: id,
        studentUserId,
        source: "class" as const,
      })),
    );
    for (const handed of work.handedIn) {
      const studentUserId = learnerOf(handed.learner).id;
      const submissionId = Bun.randomUUIDv7();
      const attemptId = Bun.randomUUIDv7();
      const handedAt = moment((work.due ?? 0) + handed.after, 17);
      await tx.insert(submissions).values({
        tenantId,
        id: submissionId,
        assignmentId: id,
        studentUserId,
        state: handed.returned ? "returned" : "submitted",
      });
      await tx.insert(submissionAttempts).values({
        tenantId,
        id: attemptId,
        submissionId,
        studentUserId,
        number: 1,
        isLate: handed.after > 0,
        submittedAt: handedAt,
        submittedByUserId: studentUserId,
      });
      await tx.insert(documents).values({
        tenantId,
        hostType: "submission_attempt",
        hostId: attemptId,
        orgId: schoolId,
        kind: "rich_text",
        schemaVersion: 1,
        content: plainContent(handed.answer) as unknown as Record<
          string,
          unknown
        >,
        plainText: handed.answer,
        frozenAt: handedAt,
      });
      if (handed.returned)
        await tx.insert(assessments).values({
          tenantId,
          attemptId,
          submissionId,
          studentUserId,
          score: handed.returned.score,
          effectiveScore: handed.returned.score,
          feedback: handed.returned.feedback,
          gradedByUserId: teacher.id,
          releasedAt: moment((work.due ?? 0) + 3, 9),
        });
    }
  }

  for (const module of ACADEMY_MODULES) {
    const { id: classId, teacher } = classOf(module.classCode);
    const created = await insertModule(tx, {
      tenantId,
      schoolId,
      authorId: teacher.id,
      title: module.title,
      summary: module.summary,
      sequential: true,
      prerequisiteId: null,
      prerequisiteScore: null,
      practiceBands: [],
    });
    await setModuleClasses(tx, {
      tenantId,
      moduleId: created.id,
      classIds: [classId],
    });
    for (const lesson of module.lessons) {
      const row = await insertLesson(tx, {
        tenantId,
        moduleId: created.id,
        title: lesson.title,
        completion: "view",
        passScore: null,
        review: false,
        vowelMarks: "shown",
        language: null,
        translationTitle: null,
        young: false,
        readAlong: false,
        condition: null,
        bands: [],
      });
      const content = contentOfLesson({
        version: 2,
        blocks: [
          {
            id: Bun.randomUUIDv7(),
            type: "content",
            content: plainContent(lesson.text),
          },
        ],
      });
      if (!content) throw new Error(`${lesson.title} cannot be a document`);
      const document = await saveDocument(tx, {
        tenantId,
        orgId: schoolId,
        host: { type: "lesson", id: row.id },
        kind: "lesson",
        content: { ...content },
        plainText: contentPlainText(content),
        mediaIds: contentFileIds(content),
        userId: teacher.id,
      });
      if (!module.published) continue;
      await snapshotPublish(tx, {
        tenantId,
        documentId: document.id,
        userId: teacher.id,
      });
      for (const learner of lesson.doneBy)
        await recordProgress(tx, {
          tenantId,
          lessonId: row.id,
          studentId: learnerOf(learner).id,
          completed: { by: "student" },
        });
    }
    if (module.published)
      await setModuleState(tx, {
        tenantId,
        id: created.id,
        expectedVersion: created.version,
        state: "published",
        publishAt: moment(-35, 6).toISOString(),
      });
  }

  // Each running class's register by day for the school days before today,
  // so the seed's today is still the teacher's to take.
  const [school] = await tx
    .select({ weekStart: orgs.weekStart, weekendDays: orgs.weekendDays })
    .from(orgs)
    .where(and(eq(orgs.tenantId, tenantId), eq(orgs.id, schoolId)));
  if (!school) throw new Error("no seeded academy");
  const taughtDays: string[] = [];
  for (let back = 1; taughtDays.length < 10; back += 1)
    if (dayOpen(school, day(-back), null)) taughtDays.unshift(day(-back));
  const roll = random(0x1a7e5);
  const registers: (typeof attendanceRegisters.$inferInsert)[] = [];
  const marks: (typeof attendanceEvents.$inferInsert)[] = [];
  for (const code of ["PY-EVE", "WEB-AUT"]) {
    const { id: classId, run, teacher } = classOf(code);
    for (const takenOn of taughtDays) {
      const registerId = Bun.randomUUIDv7();
      registers.push({
        tenantId,
        id: registerId,
        orgId: schoolId,
        classId,
        kind: "day",
        daily: true,
        takenOn,
        state: "submitted",
        recordedByUserId: teacher.id,
        submittedAt: new Date(`${takenOn}T16:10:00Z`),
      });
      for (const studentUserId of inClassOn(run, takenOn)) {
        const chance = roll();
        const meaning =
          chance < 0.06 ? "absent" : chance < 0.14 ? "late" : "present";
        const explained = meaning !== "present" && roll() < 0.5;
        marks.push({
          tenantId,
          takenOn,
          registerId,
          studentUserId,
          categoryDescriptorId: need(categories, meaning),
          categoryMeaning: meaning,
          reasonDescriptorId: explained
            ? need(reasons, meaning === "late" ? "transport" : "illness")
            : null,
          minutes: meaning === "late" ? 5 + Math.floor(roll() * 25) : null,
          recordedByUserId: teacher.id,
        });
      }
    }
  }
  await tx.insert(attendanceRegisters).values(registers);
  await tx.insert(attendanceEvents).values(marks);

  const threads: (typeof messageThreads.$inferInsert)[] = [];
  const members: (typeof threadMembers.$inferInsert)[] = [];
  const posts: (typeof messages.$inferInsert)[] = [];
  const conversation = (
    kind: "direct" | "group",
    subject: string | null,
    people: { id: string; read: boolean }[],
    said: { by: string; text: string; at: Date }[],
  ) => {
    const threadId = Bun.randomUUIDv7();
    const [first] = said;
    const last = said.at(-1);
    if (!first || !last) throw new Error("a seeded conversation says nothing");
    threads.push({
      tenantId,
      id: threadId,
      orgId: schoolId,
      kind,
      subject,
      createdByUserId: first.by,
      lastMessageAt: last.at,
    });
    members.push(
      ...people.map((each) => ({
        tenantId,
        threadId,
        userId: each.id,
        role: each.id === first.by ? ("owner" as const) : ("member" as const),
        joinedAt: first.at,
        lastReadAt: each.read ? last.at : null,
      })),
    );
    posts.push(
      ...said.map((each) => ({
        tenantId,
        threadId,
        authorUserId: each.by,
        body: each.text,
        createdAt: each.at,
      })),
    );
  };
  conversation(
    "direct",
    null,
    [
      { id: teacherOf(1).id, read: true },
      { id: learnerOf(2).id, read: true },
    ],
    [
      {
        by: teacherOf(1).id,
        text: "Karim, your FizzBuzz is nearly there: try the numbers that are multiples of both first.",
        at: moment(-3, 15),
      },
      {
        by: learnerOf(2).id,
        text: "That was it. I will hand it in before Thursday's session.",
        at: moment(-2, 19),
      },
    ],
  );
  conversation(
    "direct",
    null,
    [
      { id: teacherOf(2).id, read: true },
      { id: learnerOf(10).id, read: false },
    ],
    [
      {
        by: teacherOf(2).id,
        text: "Mostafa, I have not seen your page about yourself yet. Send what you have and we can finish it together.",
        at: moment(-1, 10),
      },
    ],
  );
  conversation(
    "group",
    "Teachers",
    [
      { id: admin.id, read: true },
      ...teachers.map((teacher) => ({ id: teacher.id, read: true })),
    ],
    [
      {
        by: admin.id,
        text: "The winter data cohort is full. Ghada, the room plan is in Lab 1 from its first evening.",
        at: moment(-4, 9),
      },
      {
        by: teacherOf(3).id,
        text: "Thank you. I will send the setup notes to the learners a week before.",
        at: moment(-4, 11),
      },
    ],
  );
  await tx.insert(messageThreads).values(threads);
  await tx.insert(threadMembers).values(members);
  await tx.insert(messages).values(posts);
  const written = await tx.execute<{
    id: string;
    body: string;
    author_user_id: string | null;
  }>(sql`
    select x.id, x.body, x.author_user_id from core.messages x
    where x.tenant_id = ${tenantId}::uuid
      and x.thread_id = any(${uuidArray(threads.map((thread) => thread.id ?? ""))})`);
  for (const row of written)
    await saveDocument(tx, {
      tenantId,
      orgId: schoolId,
      host: { type: "message", id: row.id },
      content: plainContent(row.body) as unknown as Record<string, unknown>,
      plainText: row.body,
      mediaIds: [],
      userId: row.author_user_id,
      frozen: true,
    });

  await insertAnnouncements(
    tx,
    { tenantId, schoolId, authorId: admin.id, on: today },
    [
      {
        title: "Welcome to the autumn courses",
        body: "Sessions run in Lab 1 and Lab 2 from six in the evening. Your lessons and work are in the app; bring a laptop if you have one.",
        audience: { scope: "school", classId: null },
        urgency: "normal",
        pinnedUntil: day(30),
        publishAt: moment(-42, 6),
      },
      {
        title: "Lab 2 closes early on Thursday",
        body: "Lab 2 closes at eight this Thursday for a network upgrade. The web cohort meets in Lab 1 instead.",
        audience: { scope: "school", classId: null },
        urgency: "important",
        publishAt: moment(-1, 8),
      },
    ],
  );
}

export const SEED_TENANTS: {
  spec: TenantSpec;
  schools: SeedSchoolPlan[];
  domain: string;
  seed: number;
}[] = [
  {
    spec: {
      kind: "school_group",
      nameEn: "Northwind Schools",
      nameAr: "مدارس نورثويند",
      defaultLocale: "ar",
      jurisdictions: ["EG"],
      schools: [
        {
          nameEn: "Northwind International College",
          nameAr: "كلية نورثويند الدولية",
          timeZone: "Africa/Cairo",
          countryCode: "EG",
          defaultLocale: "en",
        },
        {
          nameEn: "Northwind East School",
          nameAr: "مدرسة نورثويند الشرقية",
          timeZone: "Africa/Cairo",
          countryCode: "EG",
          defaultLocale: "ar",
        },
      ],
    },
    schools: [
      {
        slug: "northwind",
        nameEn: "Northwind International College",
        nameAr: "كلية نورثويند الدولية",
        grades: ["grade_7", "grade_8", "grade_9"],
        studentsPerGrade: 6,
        admissions: true,
      },
      {
        slug: "northwind-east",
        nameEn: "Northwind East School",
        nameAr: "مدرسة نورثويند الشرقية",
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
  {
    spec: {
      kind: "school",
      nameEn: "Fernhill School",
      nameAr: "مدرسة فيرنهيل",
      defaultLocale: "en",
      jurisdictions: ["EG"],
      schools: [
        {
          nameEn: "Fernhill School",
          nameAr: "مدرسة فيرنهيل",
          timeZone: "Africa/Cairo",
          countryCode: "EG",
          defaultLocale: "en",
        },
      ],
    },
    schools: [
      {
        slug: "fernhill",
        nameEn: "Fernhill School",
        nameAr: "مدرسة فيرنهيل",
        grades: ["grade_8"],
        studentsPerGrade: 3,
        basic: true,
      },
    ],
    domain: "fernhill.example.com",
    seed: 13,
  },
  {
    spec: {
      kind: "school",
      nameEn: "Lanternfield Code Academy",
      nameAr: "أكاديمية لانترنفيلد للبرمجة",
      defaultLocale: "en",
      jurisdictions: ["EG"],
      schools: [
        {
          nameEn: "Lanternfield Code Academy",
          nameAr: "أكاديمية لانترنفيلد للبرمجة",
          timeZone: "Africa/Cairo",
          countryCode: "EG",
          defaultLocale: "en",
        },
      ],
    },
    schools: [
      {
        kind: "academy",
        slug: "lanternfield",
        nameEn: "Lanternfield Code Academy",
        nameAr: "أكاديمية لانترنفيلد للبرمجة",
        modules: ["coursework", "attendance", "elearning"],
      },
    ],
    domain: "lanternfield.example.com",
    seed: 17,
  },
];

/**
 * The development seed: a school group of two schools, with a teacher who
 * works at both and a family with children at both, a standalone school in
 * another jurisdiction, a small school entitled to Basic alone, and a
 * coding academy of adults on core and the teaching modules alone. Every
 * adult and some students can sign in with `SEED_PASSWORD`.
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
        reachable: true,
        visitor: DEV_VISITOR,
        names: DEV_NAMES,
        attendanceUntil: "2026-09-24",
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
        await giveAccount(tx, tenant.tenantId, admin.id, login, {
          passwordHash,
          reachable: true,
        });
        logins.push({
          role: "district_administrator",
          loginName: login,
          schoolId: null,
        });
      }
      for (const [index, school] of plan.schools.entries()) {
        const schoolId = tenant.schoolIds[index];
        if (!schoolId) throw new Error("school id missing");
        if ("kind" in school)
          await seedAcademy(tx, tenant.tenantId, schoolId, school, {
            passwordHash,
            domain: plan.domain,
            today:
              options.today ??
              schoolDate(plan.spec.schools[index]?.timeZone ?? "UTC"),
            logins,
          });
        else await seedSchool(tx, tenant.tenantId, schoolId, school, context);
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
        modules:
          "kind" in school
            ? school.modules
            : school.basic
              ? BASIC_MODULES
              : MODULE_IDS,
      })),
      logins,
    });
  }
  return result;
}

const seedChecklist = (labels: [string, string, string][]) =>
  labels.map(([kind, en, ar], index) => ({
    key: `0192f0a4-7a1c-7b5a-9a2e-6e6f1f2a3d${String(index).padStart(2, "0")}`,
    kind: kind as "document" | "assessment" | "interview",
    labelEn: en,
    labelAr: ar,
    required: kind === "document",
  }));

const HEARD = "0192f0a4-7a1c-7b5a-9a2e-5e6f1f2a3d01";
const MORE = "0192f0a4-7a1c-7b5a-9a2e-5e6f1f2a3d02";
const OPEN_DAY = "0192f0a4-7a1c-7b5a-9a2e-5e6f1f2a3d14";

/** The seeded application form's two questions, in either language, with the same ids. */
function applicationQuestions(locale: "en" | "ar"): FormQuestion[] {
  const words = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const asked = { points: 0, explanation: "", tries: null };
  return [
    {
      ...asked,
      id: HEARD,
      type: "choice",
      required: true,
      prompt: words(
        "How did you hear about the school?",
        "كيف عرفتم بالمدرسة؟",
      ),
      hints: [],
      options: (
        [
          ["A friend or family", "صديق أو قريب"],
          ["Our website", "موقعنا"],
          ["Social media", "وسائل التواصل"],
          ["An open day", "يوم مفتوح"],
        ] as const
      ).map(([en, ar], place) => ({
        id: `0192f0a4-7a1c-7b5a-9a2e-5e6f1f2a3d1${place + 1}`,
        text: words(en, ar),
        feedback: "",
      })),
      correctOptionIds: [],
      multiple: false,
      shuffle: false,
    },
    {
      ...asked,
      id: MORE,
      type: "written",
      prompt: words(
        "Anything else we should know about your child?",
        "هل هناك ما ينبغي أن نعرفه عن طفلكم؟",
      ),
      hints: [
        words(
          "Interests, languages spoken at home, what they are looking forward to.",
          "الاهتمامات، واللغات التي يتحدثها في البيت، وما يتطلع إليه.",
        ),
      ],
      wordLimit: null,
    },
  ];
}

/**
 * Admissions for next year: the year itself, a published application form
 * with two questions of the school's own, intakes into KG1 and Grade 1 open
 * today, a family who registered and sent an application for KG1, and
 * other families' KG1 applications the office is reading and deciding.
 */
async function seedAdmissions(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  context: {
    passwordHash: string;
    reachable: boolean;
    visitor: Visitor;
    login: string;
    logins: SeededTenant["logins"];
    officeId: string;
  },
) {
  const yearId = Bun.randomUUIDv7();
  await tx.insert(academicSessions).values({
    tenantId,
    id: yearId,
    orgId: schoolId,
    type: "school_year",
    schoolYearId: yearId,
    titleEn: "2027–2028",
    titleAr: "2027–2028",
    span: "[2027-09-12,2028-06-16)",
    schoolYear: 2028,
    lifecycle: "upcoming",
  });
  const org = { tenantId, orgId: schoolId };
  const form = await insertAdmissionForm(tx, {
    ...org,
    nameEn: "Application form",
    nameAr: "استمارة الالتحاق",
    primaryLocale: "en",
    body: formDocument(applicationQuestions("en")),
    translation: formDocument(applicationQuestions("ar")),
  });
  const published = await publishAdmissionForm(tx, {
    ...org,
    id: form.id,
    expectedVersion: form.version,
    userId: null,
  });
  if (!published) throw new Error("Seed form was not published");
  const grades = await descriptorIds(tx, tenantId, "grade_level");
  const papers: [string, string, string][] = [
    ["document", "Birth certificate", "شهادة الميلاد"],
    [
      "document",
      "Parents' national IDs or passports",
      "بطاقات الرقم القومي أو جوازات سفر الوالدين",
    ],
    ["document", "Vaccination card", "بطاقة التطعيمات"],
  ];
  const kg1 = await insertIntake(tx, {
    ...org,
    titleEn: "KG1, 2027–2028",
    titleAr: "الروضة الأولى، 2027–2028",
    startsOn: "2027-09-12",
    opensOn: "2026-10-15",
    closesOn: "2027-03-31",
    capacity: 40,
    formId: form.id,
    checklist: seedChecklist([
      ...papers,
      ["assessment", "Readiness play session", "جلسة لعب لتقييم الاستعداد"],
      ["interview", "Meeting with the family", "لقاء مع الأسرة"],
    ]),
    currency: "EGP",
    fees: [
      { kind: "application", amount: 1500 },
      { kind: "registration", amount: 10000 },
      { kind: "tuition", amount: 185000 },
    ],
    decisionsOn: "2027-04-15",
    offerDays: 14,
    ageCutoffOn: "2027-10-01",
    minAgeMonths: 48,
    maxAgeMonths: 71,
    priorities: [
      "sibling",
      "staff_child",
      "returning_student",
      "additional_needs",
    ],
    letters: {},
  });
  const first = await insertIntake(tx, {
    ...org,
    titleEn: "Grade 1, 2027–2028",
    titleAr: "الصف الأول، 2027–2028",
    startsOn: "2027-09-12",
    opensOn: "2026-10-15",
    closesOn: "2027-03-31",
    capacity: 24,
    formId: form.id,
    checklist: seedChecklist([
      ...papers,
      ["document", "Last school report", "آخر شهادة مدرسية"],
      [
        "assessment",
        "English and Arabic assessment",
        "تقييم في اللغتين الإنجليزية والعربية",
      ],
    ]),
    currency: "EGP",
    fees: [
      { kind: "application", amount: 1500 },
      { kind: "tuition", amount: 198000 },
    ],
    decisionsOn: "2027-04-15",
    offerDays: 14,
    ageCutoffOn: "2027-10-01",
    minAgeMonths: 72,
    maxAgeMonths: 107,
    priorities: ["sibling", "returning_student"],
    letters: {},
  });
  for (const [intake, grade] of [
    [kg1, "kg1"],
    [first, "grade_1"],
  ] as const) {
    await setIntakeYear(tx, { ...org, intakeId: intake.id, yearId });
    await setIntakeGrade(tx, {
      tenantId,
      intakeId: intake.id,
      gradeId: need(grades, grade),
    });
  }

  const parent = person(context.visitor.given, context.visitor.family, "male");
  await insertPerson(tx, tenantId, parent, { primaryOrgId: schoolId });
  await giveAccount(tx, tenantId, parent.id, context.login, context);
  await openApplicantRole(tx, {
    ...org,
    userId: parent.id,
    today: "2026-10-20",
    role: "applicant_family",
  });
  context.logins.push({
    role: "applicant",
    loginName: context.login,
    schoolId,
  });
  const child = person(context.visitor.child, context.visitor.family, "male");
  await insertPerson(tx, tenantId, child, {
    primaryOrgId: schoolId,
    birthDate: "2023-03-14",
    birthDateSource: "guardian_declared",
  });
  const relations = await descriptorIds(tx, tenantId, "relation");
  const application = await insertApplication(tx, {
    ...org,
    intakeId: kg1.id,
    formVersionId: published.id,
    filedByUserId: parent.id,
    applicantUserId: child.id,
    locale: "en",
    form: {
      relationId: need(relations, "father"),
      responsible: true,
      phone: "+20 100 555 0199",
      other: null,
      schools: [
        {
          name: "Little Steps Nursery",
          country: "EG",
          city: "Cairo",
          fromYear: 2025,
          toYear: null,
          grade: "Nursery",
          leaving: "Starting school",
        },
      ],
      answers: {},
    },
    checklist: seedChecklist([
      ...papers,
      ["assessment", "Readiness play session", "جلسة لعب لتقييم الاستعداد"],
      ["interview", "Meeting with the family", "لقاء مع الأسرة"],
    ]),
  });
  const answered = readFormAnswers(
    formQuestions(formDocument(applicationQuestions("en"))),
    {
      [HEARD]: { type: "choice", optionIds: [OPEN_DAY] },
      [MORE]: {
        type: "written",
        text: "Omar loves building things and speaks Arabic and English at home.",
      },
    },
  );
  if (!answered.ok) throw new Error("Seed answers do not fit the form");
  await markApplicationSubmitted(tx, {
    ...org,
    id: application.id,
    expectedVersion: application.version,
    reference: "2027-0001",
    locale: "en",
    answers: answered.answers,
    matches: { students: [], guardians: [], siblings: [], staffParent: false },
    priorities: [],
    additionalNeeds: false,
    enquiryId: null,
  });
  await insertApplicationEntry(tx, {
    ...org,
    applicationId: application.id,
    kind: "state",
    body: "",
    details: { from: "draft", to: "submitted" },
    authorUserId: parent.id,
  });

  const others: {
    parent: [Name, Name, "female" | "male"];
    child: [Name, Name, "female" | "male"];
    born: string;
    relation: string;
    state: "submitted" | "in_review" | "decided";
    priorities: ("sibling" | "staff_child")[];
  }[] = [
    {
      parent: [["Nadia", "نادية"], ["Fahmy", "فهمي"], "female"],
      child: [["Laila", "ليلى"], ["Fahmy", "فهمي"], "female"],
      born: "2022-11-02",
      relation: "mother",
      state: "in_review",
      priorities: ["sibling"],
    },
    {
      parent: [["Karim", "كريم"], ["Salem", "سالم"], "male"],
      child: [["Yusuf", "يوسف"], ["Salem", "سالم"], "male"],
      born: "2023-01-20",
      relation: "father",
      state: "in_review",
      priorities: [],
    },
    {
      parent: [["Mona", "منى"], ["Rashad", "رشاد"], "female"],
      child: [["Hana", "هنا"], ["Rashad", "رشاد"], "female"],
      born: "2022-12-08",
      relation: "mother",
      state: "decided",
      priorities: ["staff_child"],
    },
    {
      parent: [["Tarek", "طارق"], ["Nabil", "نبيل"], "male"],
      child: [["Adam", "آدم"], ["Nabil", "نبيل"], "male"],
      born: "2023-04-30",
      relation: "father",
      state: "submitted",
      priorities: [],
    },
  ];
  for (const [index, other] of others.entries()) {
    const adult = person(other.parent[0], other.parent[1], other.parent[2]);
    await insertPerson(tx, tenantId, adult, { primaryOrgId: schoolId });
    // The family whose decision waits for release signs in, so the offer
    // can be followed to the family's answer.
    if (other.state === "decided") {
      const login = context.login.replace("applicant.", "applicant2.");
      await giveAccount(tx, tenantId, adult.id, login, context);
      await openApplicantRole(tx, {
        ...org,
        userId: adult.id,
        today: "2026-10-20",
        role: "applicant_family",
      });
      context.logins.push({ role: "applicant", loginName: login, schoolId });
    }
    const kid = person(other.child[0], other.child[1], other.child[2]);
    await insertPerson(tx, tenantId, kid, {
      primaryOrgId: schoolId,
      birthDate: other.born,
      birthDateSource: "guardian_declared",
    });
    const made = await insertApplication(tx, {
      ...org,
      intakeId: kg1.id,
      formVersionId: published.id,
      filedByUserId: adult.id,
      applicantUserId: kid.id,
      locale: index % 2 === 0 ? "ar" : "en",
      form: {
        relationId: need(relations, other.relation),
        responsible: true,
        phone: "",
        other: null,
        schools: [],
        answers: {},
      },
      checklist: seedChecklist([
        ...papers,
        ["assessment", "Readiness play session", "جلسة لعب لتقييم الاستعداد"],
        ["interview", "Meeting with the family", "لقاء مع الأسرة"],
      ]),
    });
    const sent = await markApplicationSubmitted(tx, {
      ...org,
      id: made.id,
      expectedVersion: made.version,
      reference: `2027-${String(index + 2).padStart(4, "0")}`,
      locale: index % 2 === 0 ? "ar" : "en",
      answers: [],
      matches: {
        students: [],
        guardians: [],
        siblings: [],
        staffParent: other.priorities.includes("staff_child"),
      },
      priorities: other.priorities,
      additionalNeeds: false,
      enquiryId: null,
    });
    await insertApplicationEntry(tx, {
      ...org,
      applicationId: made.id,
      kind: "state",
      body: "",
      details: { from: "draft", to: "submitted" },
      authorUserId: adult.id,
    });
    if (other.state === "submitted" || sent === null) continue;
    const reviewing = await setApplicationState(tx, {
      ...org,
      id: made.id,
      expectedVersion: sent,
      from: "submitted",
      state: "in_review",
      exitReason: null,
    });
    await insertApplicationEntry(tx, {
      ...org,
      applicationId: made.id,
      kind: "state",
      body: "",
      details: { from: "submitted", to: "in_review" },
      authorUserId: context.officeId,
    });
    if (other.state === "decided" && reviewing !== null) {
      await decideApplication(tx, {
        ...org,
        id: made.id,
        expectedVersion: reviewing,
        decision: "offer",
        userId: context.officeId,
      });
      await insertApplicationEntry(tx, {
        ...org,
        applicationId: made.id,
        kind: "state",
        body: "",
        details: { from: "in_review", to: "decided", decision: "offer" },
        authorUserId: context.officeId,
      });
    }
  }
}

/**
 * A live, bilingual website: a home page and an about page published in both
 * languages, an admissions page still in draft, and news posts.
 */
/**
 * Enquiries further along than the website's, so the inbox shows the work:
 * a phone call the office is following up and a question already answered.
 */
async function seedEnquiries(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  officeId: string,
  visitor: Visitor,
) {
  await tx.insert(siteEnquiries).values([
    {
      tenantId,
      orgId: schoolId,
      source: "phone",
      locale: "en",
      purpose: "visit",
      name: `${visitor.given[0]} ${visitor.family[0]}`,
      phone: "+20 122 555 0144",
      childName: "Yusuf",
      childYear: "Grade 4",
      message: "Moving to Cairo in January; would like to see the school.",
      state: "in_progress",
      assigneeUserId: officeId,
      createdByUserId: officeId,
      firstRespondedAt: sql`statement_timestamp()`,
    },
    {
      tenantId,
      orgId: schoolId,
      purpose: "general",
      name: `${visitor.given[1]} ${visitor.family[1]}`,
      email: `${emailName(visitor)}.bus@example.com`,
      locale: "ar",
      message: "هل توفر المدرسة حافلة من المعادي؟",
      state: "closed",
      closedReason: "answered",
      assigneeUserId: officeId,
      firstRespondedAt: sql`statement_timestamp()`,
    },
  ]);
  // Every enquiry, the website's included, has its conversation in the
  // admissions mailbox, as the API gives one when an enquiry arrives.
  const all = await tx
    .select({ id: siteEnquiries.id, source: siteEnquiries.source })
    .from(siteEnquiries)
    .where(
      and(
        eq(siteEnquiries.tenantId, tenantId),
        eq(siteEnquiries.orgId, schoolId),
        isNull(siteEnquiries.threadId),
      ),
    );
  for (const enquiry of all) {
    const threadId = await openEnquiryConversation(tx, {
      tenantId,
      enquiryId: enquiry.id,
    });
    if (threadId && enquiry.source === "phone") {
      const words =
        "Called back. They can visit on a Tuesday morning; offered 10:00.";
      const call = await postMessage(tx, {
        tenantId,
        threadId,
        kind: "call",
        authorId: officeId,
        body: words,
      });
      await saveDocument(tx, {
        tenantId,
        orgId: schoolId,
        host: { type: "message", id: call.id },
        content: plainContent(words) as unknown as Record<string, unknown>,
        plainText: words,
        mediaIds: [],
        userId: officeId,
        frozen: true,
      });
    }
  }
}

async function seedSite(
  tx: Tx,
  tenantId: string,
  schoolId: string,
  visitor: Visitor,
) {
  const [existing] = await tx.execute<{ id: string }>(sql`
    select id from core.site_settings
    where tenant_id = ${tenantId}::uuid and org_id = ${schoolId}::uuid limit 1`);
  if (existing) return;
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
    bilingual: true,
    taglineEn: "Learning together, every day",
    taglineAr: "نتعلّم معًا كل يوم",
    socialLinks: [
      { kind: "facebook", url: "https://www.facebook.com/example" },
    ],
    bannerEn: "Open morning on 10 October: book a tour on the Visit page.",
    bannerAr: "صباح الأبواب المفتوحة يوم 10 أكتوبر: احجز جولة من صفحة الزيارة.",
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
      indexed: true,
      isHome: plan.home ?? false,
    });
    const host = { type: "site_page", id: created.id };
    const built = buildTemplate(plan.template, "en");
    const content = blankPage(built.content);
    const translation = {
      ...blankPage(built.translation),
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
      kind: "site" as const,
      parentId: null,
      position,
      slug: plan.slug,
      isHome: plan.home ?? false,
      inMenu: true,
      indexed: true,
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
    const created = await insertBroadcast(tx, {
      ...unsetFields,
      tenantId,
      schoolId,
      authorId: userId,
      titleEn: plan.titleEn,
      titleAr: plan.titleAr,
      excerptEn: plan.excerptEn,
      excerptAr: plan.excerptAr,
    });
    await keepSitePost(tx, {
      tenantId,
      orgId: schoolId,
      broadcastId: created.id,
      post: {
        slug: plan.slug,
        categoryId: news?.id ?? null,
        pinned: plan.pinned,
      },
    });
    const host = { type: "announcement", id: created.id };
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
    await setBroadcastState(tx, {
      tenantId,
      id: created.id,
      expectedVersion: created.version,
      state: "published",
      publishAt: publishedAt,
      told: "now",
    });
    await snapshotPublish(tx, { tenantId, documentId: original.id, userId });
    if (other) {
      await snapshotPublish(tx, { tenantId, documentId: other.id, userId });
      await reviewTranslation(tx, {
        tenantId,
        host: "announcement",
        id: created.id,
        userId,
        reviewed: true,
      });
    }
    const post = {
      id: created.id,
      categoryId: news?.id ?? null,
      slug: plan.slug,
      pinned: plan.pinned,
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
      name: `${visitor.given[0]} ${visitor.family[0]}`,
      email: `${emailName(visitor)}.family@example.com`,
      phone: "+971 50 000 0001",
      childYear: "Grade 2",
      message:
        "We are moving to the city in January. Is there a place in grade 2?",
      purpose: "enquiry" as const,
      locale: "en" as const,
    },
    {
      name: `${visitor.given[1]} ${visitor.family[1]}`,
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
      id: Bun.randomUUIDv7(),
      orgId: schoolId,
      pageId: admissions?.id ?? null,
      sectionId: null,
      networkKey: "",
      childName: "",
      answers: [],
      ...enquiry,
    });
}
