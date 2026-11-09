import type { ContentDocument } from "@faridalms/domain/content";
import type { LessonBlock, LessonCompletion } from "@faridalms/domain/learning";

import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import {
  headedContent,
  plainContent,
} from "@faridalms/domain/content-conversion";
import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { addDays } from "@faridalms/domain/school";
import { and, eq, sql } from "drizzle-orm";

import type { openOwner } from "./context";
import type { KeyEncryptionKey } from "./crypto";
import type {
  AnnouncementPlan,
  EventPlan,
  FilledSchool,
  Names,
  NewsPlan,
  SchoolPlan,
  SeededTenant,
  Tx,
  Visitor,
} from "./seed";
import type { Audience } from "./stores/audiences";

import { withPurpose } from "./context";
import { encryptField } from "./crypto";
import {
  BOYS,
  descriptorIds,
  FAMILIES,
  GIRLS,
  insertAnnouncements,
  insertEvents,
  insertNews,
  MOTHERS,
  need,
  random,
  seedNotifications,
  seedSchool,
  YEAR,
} from "./seed";
import { saveDocument, snapshotPublish } from "./stores/documents";
import {
  insertLesson,
  insertModule,
  recordProgress,
  setModuleClasses,
  setModuleState,
} from "./stores/learning";
import { setOrgFeature } from "./stores/school";
import {
  academicSessions,
  assessments,
  assignmentRecipients,
  assignments,
  attendanceRegisters,
  documents,
  healthRecords,
  messages,
  messageThreads,
  orgs,
  periodGrades,
  submissionAttempts,
  submissions,
  tenantKeys,
  threadMembers,
  users,
} from "./tables/index";
import { attendanceEvents } from "./tables/partitioned";

export interface DemoOptions {
  kek: KeyEncryptionKey;
  cell: string;
  tenantId: string;
  schoolId: string;
  slug: string;
  /** Where the logins' addresses are; a domain that takes no mail. */
  domain: string;
  /** The one password every demonstration login shares. */
  password: string;
}

export class DemoRefusedError extends Error {}

// A demonstration school has hundreds of children; drawn from the short
// lists alone, every class would hold the same few names twice.
const DEMO_NAMES: Names = {
  girls: [
    ...GIRLS,
    ["Habiba", "حبيبة"],
    ["Lina", "لينا"],
    ["Reem", "ريم"],
    ["Nada", "ندى"],
    ["Jomana", "جمانة"],
    ["Sama", "سما"],
    ["Layan", "ليان"],
    ["Hagar", "هاجر"],
    ["Yara", "يارا"],
    ["Basmala", "بسملة"],
    ["Rahma", "رحمة"],
    ["Shahd", "شهد"],
  ],
  boys: [
    ...BOYS,
    ["Mohamed", "محمد"],
    ["Ahmed", "أحمد"],
    ["Mahmoud", "محمود"],
    ["Ibrahim", "إبراهيم"],
    ["Mazen", "مازن"],
    ["Marwan", "مروان"],
    ["Yassin", "ياسين"],
    ["Malek", "مالك"],
    ["Eyad", "إياد"],
    ["Hazem", "حازم"],
    ["Taha", "طه"],
    ["Amr", "عمرو"],
  ],
  families: [
    ...FAMILIES,
    ["Abdelaziz", "عبدالعزيز"],
    ["Gamal", "جمال"],
    ["Shawky", "شوقي"],
    ["Badawi", "بدوي"],
    ["Ezzat", "عزت"],
    ["Sharaf", "شرف"],
    ["Lotfy", "لطفي"],
    ["Ragab", "رجب"],
    ["Soliman", "سليمان"],
    ["Fouad", "فؤاد"],
    ["Hegazy", "حجازي"],
    ["Radwan", "رضوان"],
  ],
  mothers: [
    ...MOTHERS,
    ["Eman", "إيمان"],
    ["Shaimaa", "شيماء"],
    ["Marwa", "مروة"],
    ["Nermeen", "نرمين"],
    ["Doaa", "دعاء"],
    ["Hala", "هالة"],
    ["Reham", "ريهام"],
    ["Inas", "إيناس"],
    ["Abeer", "عبير"],
    ["Nesma", "نسمة"],
  ],
};

/** The family who enquires and applies: never the platform's owner, whom prospects should not meet. */
const DEMO_VISITOR: Visitor = {
  given: ["Tamer", "تامر"],
  family: ["Shafik", "شفيق"],
  child: ["Yassin", "ياسين"],
};

const DEMO_PLAN: SchoolPlan = {
  slug: "",
  grades: [
    "kg2",
    "grade_1",
    "grade_2",
    "grade_3",
    "grade_4",
    "grade_5",
    "grade_6",
    "grade_7",
    "grade_8",
    "grade_9",
  ],
  studentsPerGrade: 40,
  sections: 2,
  classTeacherTeaches: true,
  admissions: true,
};

/**
 * Fills a school that was provisioned empty with a year in progress, for
 * showing the product to a school: staff, two classes of twenty in each
 * grade from KG2 to grade 9 with their families, timetable, registers to
 * yesterday, and the work of a real term around today: coursework set,
 * handed in and marked; lessons; conversations with families; notices,
 * news and events; admissions and enquiries. A website the school already
 * has is left as it is.
 *
 * No seeded address can be written to: the logins carry no email contact
 * and the families' phones take no SMS, so nothing a demonstration does
 * leaves the platform. Every login shares `password`.
 */
export async function seedDemoSchool(
  owner: ReturnType<typeof openOwner>,
  options: DemoOptions,
): Promise<SeededTenant["logins"]> {
  const passwordHash = await Bun.password.hash(options.password, {
    algorithm: "argon2id",
  });
  const logins: SeededTenant["logins"] = [];
  await owner.asOwner(options.tenantId, "demo", async (tx) => {
    const [school] = await tx
      .select({ timeZone: orgs.timeZone })
      .from(orgs)
      .where(
        and(eq(orgs.tenantId, options.tenantId), eq(orgs.id, options.schoolId)),
      );
    if (!school) throw new DemoRefusedError("The school is not in this cell.");
    const [year] = await tx
      .select({ id: academicSessions.id })
      .from(academicSessions)
      .where(
        and(
          eq(academicSessions.tenantId, options.tenantId),
          eq(academicSessions.orgId, options.schoolId),
        ),
      )
      .limit(1);
    if (year)
      throw new DemoRefusedError(
        "The school already has a year, so it is not the empty school a demonstration fills.",
      );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: school.timeZone ?? "UTC",
    }).format(new Date());
    await seedSchool(
      tx,
      options.tenantId,
      options.schoolId,
      { ...DEMO_PLAN, slug: options.slug },
      {
        passwordHash,
        reachable: false,
        visitor: DEMO_VISITOR,
        content: (inner, filled) => fillTerm(inner, filled, today),
        names: DEMO_NAMES,
        attendanceUntil: today < YEAR.end ? today : addDays(YEAR.end, -1),
        next: random(0xde70),
        kek: options.kek,
        cell: options.cell,
        domain: options.domain,
        logins,
        shared: { reference: 1000 },
      },
    );
  });
  return logins;
}

async function fillTerm(tx: Tx, school: FilledSchool, today: string) {
  const classes = await taughtClasses(tx, school);
  await lessonsTaken(tx, school, today);
  await coursework(tx, school, classes, today);
  await learning(tx, school, classes, today);
  await conversations(tx, school, classes, today);
  await notices(tx, school, classes, today);
  await health(tx, school);
}

type Subject = "arabic" | "english" | "mathematics" | "science";
type Band = "kg" | "lower" | "upper" | "middle";

function bandOf(grade: string): Band {
  if (grade.startsWith("kg") || grade === "pre_kg") return "kg";
  const year = Number(grade.replace("grade_", ""));
  return year <= 3 ? "lower" : year <= 6 ? "upper" : "middle";
}

interface TaughtClass {
  id: string;
  homeroomId: string;
  homeroomTitle: string;
  grade: string;
  band: Band;
  subject: Subject;
  teacherId: string;
  homeroomTeacherId: string;
  students: string[];
}

async function taughtClasses(
  tx: Tx,
  school: FilledSchool,
): Promise<TaughtClass[]> {
  const rows = await tx.execute<{
    id: string;
    homeroom_id: string;
    homeroom_title: string;
    grade: string;
    subject: Subject;
    teacher_id: string;
    homeroom_teacher_id: string;
    students: string;
  }>(sql`
    select c.id, h.id as homeroom_id, h.title_en as homeroom_title,
      g.code_value as grade, s.code_value as subject, t.user_id as teacher_id,
      ht.user_id as homeroom_teacher_id,
      coalesce((select array_agg(e.user_id order by e.user_id) from core.enrollments e
        where e.tenant_id = h.tenant_id and e.class_id = h.id and e.role = 'student'
          and e.status = 'active')::text[], '{}')::text as students
    from core.classes c
    join core.classes h on h.tenant_id = c.tenant_id and h.id = c.homeroom_class_id
    join core.descriptors g on g.tenant_id = c.tenant_id and g.id = c.grade_level_descriptor_id
    join core.descriptors s on s.tenant_id = c.tenant_id and s.id = c.subject_descriptor_id
    join core.enrollments t on t.tenant_id = c.tenant_id and t.class_id = c.id
      and t.role = 'teacher' and t.is_primary
    join core.enrollments ht on ht.tenant_id = h.tenant_id and ht.class_id = h.id
      and ht.role = 'teacher' and ht.is_primary
    where c.tenant_id = ${school.tenantId}::uuid and c.school_year_id = ${school.yearId}::uuid
      and c.class_type = 'scheduled'
    order by h.code, c.code`);
  return rows.map((row) => ({
    id: row.id,
    homeroomId: row.homeroom_id,
    homeroomTitle: row.homeroom_title,
    grade: row.grade,
    band: bandOf(row.grade),
    subject: row.subject,
    teacherId: row.teacher_id,
    homeroomTeacherId: row.homeroom_teacher_id,
    students: row.students.replace(/[{}]/g, "").split(",").filter(Boolean),
  }));
}

/** A school day on or after `day`, the school's weekend being Friday and Saturday. */
function schoolDay(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 5
    ? addDays(day, 2)
    : weekday === 6
      ? addDays(day, 1)
      : day;
}

/** A day as a school writes it to families: "Sunday 29 November". */
const spoken = (day: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
    .format(new Date(`${day}T00:00:00Z`))
    .replace(",", "");

/** A moment on a day in Cairo. */
const at = (day: string, time: string) => new Date(`${day}T${time}:00+02:00`);

const chunked = async <T>(
  rows: T[],
  write: (part: T[]) => Promise<unknown>,
) => {
  for (let index = 0; index < rows.length; index += 200)
    await write(rows.slice(index, index + 200));
};

/**
 * Today's lessons that have ended have their registers taken, as teachers
 * do at the start of each lesson: whoever missed the morning's
 * registration is absent from them, everyone else present.
 */
async function lessonsTaken(tx: Tx, school: FilledSchool, today: string) {
  const now = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
  const lessons = await tx.execute<{
    class_id: string;
    period_id: string;
    teacher_id: string;
    homeroom_id: string;
    starts: string;
  }>(sql`
    select m.class_id, m.class_period_id as period_id, m.teacher_user_id as teacher_id,
      m.group_class_id as homeroom_id, to_char(p.start_time, 'HH24:MI') as starts
    from core.class_meetings m
    join core.class_periods p on p.tenant_id = m.tenant_id and p.id = m.class_period_id
    where m.tenant_id = ${school.tenantId}::uuid and m.school_year_id = ${school.yearId}::uuid
      and m.weekday = ${weekday} and m.status = 'active'
      and p.end_time <= ${now}::time`);
  if (lessons.length === 0) return;
  const away = new Set(
    (
      await tx.execute<{ student: string }>(sql`
        select e.student_user_id as student from core.attendance_events e
        where e.tenant_id = ${school.tenantId}::uuid and e.taken_on = ${today}::date
          and e.category_meaning in ('absent', 'excused')`)
    ).map((row) => row.student),
  );
  const rosters = new Map<string, string[]>();
  for (const row of await tx.execute<{ homeroom: string; student: string }>(sql`
    select class_id as homeroom, user_id as student from core.enrollments
    where tenant_id = ${school.tenantId}::uuid and school_year_id = ${school.yearId}::uuid
      and class_type = 'homeroom' and role = 'student' and status = 'active'`))
    rosters.set(row.homeroom, [
      ...(rosters.get(row.homeroom) ?? []),
      row.student,
    ]);
  const categories = await descriptorIds(
    tx,
    school.tenantId,
    "attendance_category",
  );
  const registers: (typeof attendanceRegisters.$inferInsert)[] = [];
  const events: (typeof attendanceEvents.$inferInsert)[] = [];
  for (const lesson of lessons) {
    const registerId = Bun.randomUUIDv7();
    registers.push({
      tenantId: school.tenantId,
      id: registerId,
      orgId: school.schoolId,
      classId: lesson.class_id,
      classType: "scheduled",
      schoolYearId: school.yearId,
      classPeriodId: lesson.period_id,
      takenOn: today,
      state: "submitted",
      recordedByUserId: lesson.teacher_id,
      submittedAt: at(today, lesson.starts),
    });
    for (const studentUserId of rosters.get(lesson.homeroom_id) ?? []) {
      const meaning = away.has(studentUserId) ? "absent" : "present";
      events.push({
        tenantId: school.tenantId,
        takenOn: today,
        registerId,
        studentUserId,
        categoryDescriptorId: need(categories, meaning),
        categoryMeaning: meaning,
        recordedByUserId: lesson.teacher_id,
      });
    }
  }
  await chunked(registers, (part) =>
    tx.insert(attendanceRegisters).values(part),
  );
  await chunked(events, (part) => tx.insert(attendanceEvents).values(part));
}

// ---------------------------------------------------------------------------
// Coursework

interface Task {
  title: string;
  brief: string;
  points: number;
  /** What a student who did it well handed in. */
  answer: string;
}

/**
 * Five pieces of work a term, oldest first: two returned with marks, one
 * handed in and being marked, one due in a few days and one set for later.
 */
const TASKS: Record<Exclude<Band, "kg">, Record<Subject, Task[]>> = {
  lower: {
    arabic: [
      {
        title: "حرف الباء في أول الكلمة ووسطها وآخرها",
        brief:
          "اكتب ثلاث كلمات فيها حرف الباء: في أول الكلمة، وفي وسطها، وفي آخرها، ثم ارسم صورة لكلمة منها.",
        points: 10,
        answer: "باب، كتاب، حليب. رسمت الباب.",
      },
      {
        title: "قراءة قصة «الأسد والفأر»",
        brief:
          "اقرأ القصة مع أحد أفراد أسرتك، ثم أجب: لماذا ساعد الفأرُ الأسدَ في النهاية؟",
        points: 10,
        answer: "ساعد الفأر الأسد لأن الأسد تركه يذهب في المرة الأولى.",
      },
      {
        title: "كلمات المد بالألف",
        brief: "اقرأ الكلمات في الصفحة 24 وانسخ خمس كلمات فيها مدّ بالألف.",
        points: 10,
        answer: "نار، باب، سار، دار، جار.",
      },
      {
        title: "إملاء الأسبوع: أسماء الحيوانات",
        brief:
          "تدرّب على كتابة: قطة، أرنب، حصان، جمل، عصفور. سنكتبها في الفصل يوم الخميس.",
        points: 10,
        answer: "قطة، أرنب، حصان، جمل، عصفور.",
      },
      {
        title: "أحكي عن عائلتي",
        brief:
          "اكتب ثلاث جمل قصيرة عن عائلتك، وألصق صورة أو ارسم أفراد العائلة.",
        points: 10,
        answer: "عائلتي صغيرة. أبي طبيب وأمي معلمة. أحب أخي الصغير.",
      },
    ],
    english: [
      {
        title: "Phonics: the 'sh' and 'ch' sounds",
        brief:
          "Find four things at home with 'sh' or 'ch' in their name. Write each word and draw one of them.",
        points: 10,
        answer: "shoe, fish, chair, cheese. I drew the fish.",
      },
      {
        title: "Reading log: week 6",
        brief:
          "Read your library book for ten minutes each evening. Write the title and one sentence about your favourite part.",
        points: 10,
        answer:
          "The Gruffalo. My favourite part is when the mouse tricks the snake.",
      },
      {
        title: "Describe your favourite animal",
        brief:
          "Write three sentences about an animal you like. Use one describing word (an adjective) in each sentence.",
        points: 10,
        answer:
          "My favourite animal is a giraffe. It has a long neck. It eats green leaves from tall trees.",
      },
      {
        title: "Capital letters and full stops",
        brief:
          "Copy the five sentences on worksheet 7 and fix the capital letters and full stops.",
        points: 10,
        answer:
          "I went to the park. My sister came too. We played on the swings.",
      },
      {
        title: "My weekend in pictures",
        brief:
          "Draw three pictures of your weekend in order and write a sentence under each one using 'first', 'next' and 'last'.",
        points: 10,
        answer:
          "First I visited my grandmother. Next we ate lunch. Last we played football.",
      },
    ],
    mathematics: [
      {
        title: "Number bonds to 20",
        brief:
          "Complete the number bond wheel on page 18. Then write three number bonds to 20 of your own.",
        points: 10,
        answer: "12 + 8, 15 + 5, 11 + 9.",
      },
      {
        title: "Measuring with a ruler",
        brief:
          "Measure five things in your pencil case in centimetres and order them from shortest to longest.",
        points: 10,
        answer:
          "Eraser 4 cm, sharpener 5 cm, glue 9 cm, pencil 15 cm, ruler 30 cm.",
      },
      {
        title: "Telling the time: o'clock and half past",
        brief:
          "Draw the hands on the six clocks on the worksheet, then write what you do at 7 o'clock in the morning.",
        points: 10,
        answer: "At 7 o'clock I have breakfast.",
      },
      {
        title: "Adding two-digit numbers",
        brief: "Solve questions 1 to 10 on page 31. Show your working.",
        points: 10,
        answer: "1) 34 + 25 = 59  2) 47 + 12 = 59  3) 63 + 21 = 84 …",
      },
      {
        title: "Shapes hunt",
        brief:
          "Find a circle, a square, a triangle and a rectangle at home. Draw each and say where you found it.",
        points: 10,
        answer:
          "Circle: the clock. Square: a window. Triangle: a sandwich. Rectangle: the door.",
      },
    ],
    science: [
      {
        title: "Living and non-living things",
        brief:
          "Sort the twelve pictures on the worksheet into living and non-living. Explain one of your choices.",
        points: 10,
        answer: "A tree is living because it grows and needs water.",
      },
      {
        title: "Plant diary",
        brief:
          "Plant a bean in a cup with wet cotton. Draw it every two days and write how much it has grown.",
        points: 10,
        answer:
          "Day 2: the bean split. Day 4: a small root. Day 6: a green shoot 2 cm tall.",
      },
      {
        title: "Our five senses",
        brief:
          "Choose a fruit. Write one thing you notice about it with each of your five senses.",
        points: 10,
        answer:
          "Orange: it looks round, smells fresh, feels bumpy, tastes sweet and sounds squishy.",
      },
      {
        title: "Materials around the house",
        brief:
          "Find one thing made of wood, metal, plastic and glass. Say why each is made of that material.",
        points: 10,
        answer: "A glass window lets light in. A metal spoon is strong.",
      },
      {
        title: "Weather chart",
        brief:
          "Record the weather each morning for a week with the symbols from class.",
        points: 10,
        answer:
          "Sunday sunny, Monday sunny, Tuesday cloudy, Wednesday windy, Thursday sunny.",
      },
    ],
  },
  upper: {
    arabic: [
      {
        title: "النعت: الصفة والموصوف",
        brief:
          "استخرج خمسة نعوت من نص «رحلة إلى الأقصر» ص 37، وبيّن الموصوف في كل منها.",
        points: 20,
        answer:
          "المدينة القديمة: القديمة نعت والموصوف المدينة. النهر الطويل: الطويل نعت والموصوف النهر.",
      },
      {
        title: "تلخيص قصة «جحا والحمار»",
        brief: "لخّص القصة في خمسة أسطر بأسلوبك، واذكر الحكمة منها.",
        points: 20,
        answer:
          "خرج جحا وابنه مع الحمار، وكان الناس ينتقدونهما في كل مرة. الحكمة: إرضاء الناس غاية لا تُدرك.",
      },
      {
        title: "كتابة رسالة إلى صديق",
        brief:
          "اكتب رسالة إلى صديق تصف فيها يومًا قضيته في رحلة مدرسية، مراعيًا عناصر الرسالة.",
        points: 20,
        answer:
          "عزيزي أحمد، تحية طيبة وبعد، أكتب إليك لأحكي لك عن رحلتنا إلى المتحف المصري…",
      },
      {
        title: "إعراب الجملة الاسمية",
        brief: "أعرب الجمل الخمس في التدريب الثالث ص 42.",
        points: 20,
        answer: "العلمُ نورٌ: العلم مبتدأ مرفوع بالضمة، ونور خبر مرفوع بالضمة.",
      },
      {
        title: "حفظ قصيدة «وطني»",
        brief: "احفظ الأبيات الستة الأولى، وسجّل نفسك وأنت تلقيها.",
        points: 20,
        answer: "تم التسجيل.",
      },
    ],
    english: [
      {
        title: "Book review: 'Charlotte's Web'",
        brief:
          "Write a review of at least 150 words: the characters, your favourite part, and who you would recommend it to.",
        points: 20,
        answer:
          "Charlotte's Web is about a pig called Wilbur and a clever spider called Charlotte who saves his life…",
      },
      {
        title: "Persuasive letter to the head of school",
        brief:
          "Write a letter persuading the head of school to start a school garden. Use at least three reasons and one rhetorical question.",
        points: 20,
        answer:
          "Dear Mrs Mansour, I am writing to ask you to start a school garden. Wouldn't it be wonderful to eat vegetables we grew ourselves?…",
      },
      {
        title: "Grammar: past simple and past continuous",
        brief: "Complete exercises A and B on page 52.",
        points: 20,
        answer: "A1 was playing, A2 rang, A3 were watching…",
      },
      {
        title: "Write a mystery story opening",
        brief:
          "Write the first 200 words of a mystery story. Build suspense with short sentences and a strong setting.",
        points: 20,
        answer:
          "The lights went out. Somewhere in the old museum, a door creaked. Nadia held her breath…",
      },
      {
        title: "Spelling: words with silent letters",
        brief:
          "Learn the twelve words on the list (knight, wrist, thumb…) for Thursday's test.",
        points: 20,
        answer: "Practised all twelve words.",
      },
    ],
    mathematics: [
      {
        title: "Equivalent fractions",
        brief:
          "Complete worksheet 4. For questions 9 and 10, draw a fraction wall to show your answer.",
        points: 20,
        answer: "1/2 = 2/4 = 4/8; 2/3 = 4/6 = 8/12 …",
      },
      {
        title: "Long multiplication",
        brief:
          "Solve the eight problems on page 64. Estimate first, then calculate.",
        points: 20,
        answer: "1) 346 × 23 ≈ 7000; 346 × 23 = 7958 …",
      },
      {
        title: "Area and perimeter of my bedroom",
        brief:
          "Measure your bedroom floor, draw a plan to scale (1 cm = 50 cm) and work out its area and perimeter.",
        points: 20,
        answer: "Length 4 m, width 3 m. Area 12 m², perimeter 14 m.",
      },
      {
        title: "Decimals in money problems",
        brief:
          "Use the supermarket price list to solve the five shopping problems.",
        points: 20,
        answer: "1) 23.50 + 12.75 = 36.25 EGP …",
      },
      {
        title: "Data handling: favourite sports survey",
        brief:
          "Survey ten people about their favourite sport. Show the results in a tally chart and a bar chart.",
        points: 20,
        answer: "Football 5, swimming 2, tennis 1, basketball 2.",
      },
    ],
    science: [
      {
        title: "The water cycle diagram",
        brief:
          "Draw and label the water cycle: evaporation, condensation, precipitation and collection.",
        points: 20,
        answer:
          "Water evaporates from the sea, condenses into clouds, falls as rain and collects in rivers.",
      },
      {
        title: "Food chains in the Nile",
        brief:
          "Build two food chains with animals that live in or near the Nile. Label producer and consumers.",
        points: 20,
        answer: "Algae → tilapia → Nile perch → crocodile.",
      },
      {
        title: "Investigation: which material keeps water warm?",
        brief:
          "Plan a fair test with three materials. Write your prediction, what you will change and what you will keep the same.",
        points: 20,
        answer:
          "I predict wool will keep the water warm longest. I will change the material and keep the amount of water the same.",
      },
      {
        title: "The solar system fact file",
        brief:
          "Make a fact file about one planet: size, distance from the Sun, length of a day and one surprising fact.",
        points: 20,
        answer:
          "Mars: half the size of Earth, a day lasts 24 h 37 min, it has the tallest volcano.",
      },
      {
        title: "Healthy plate",
        brief:
          "Plan a healthy lunch and explain which food group each item belongs to.",
        points: 20,
        answer:
          "Grilled chicken (protein), rice (carbohydrate), salad (vitamins), yoghurt (dairy).",
      },
    ],
  },
  middle: {
    arabic: [
      {
        title: "تحليل قصيدة «المساء» لخليل مطران",
        brief:
          "حلّل الأبيات من 1 إلى 8: الفكرة العامة، والصور البيانية، وأثر الطبيعة في نفس الشاعر.",
        points: 20,
        answer:
          "الفكرة العامة: حزن الشاعر ومرضه ينعكسان على مشهد الغروب. من الصور البيانية: «والقلب بين مهابة ورجاء»…",
      },
      {
        title: "مقال: أثر التكنولوجيا في حياة الشباب",
        brief: "اكتب مقالًا من 250 كلمة بمقدمة وعرض وخاتمة، مع أمثلة من الواقع.",
        points: 20,
        answer:
          "أصبحت التكنولوجيا جزءًا لا يتجزأ من حياتنا اليومية، ولها آثار إيجابية وسلبية على الشباب…",
      },
      {
        title: "الأفعال الخمسة: إعرابها",
        brief: "أعرب الأفعال المخطوط تحتها في التدريبات من 1 إلى 6 ص 58.",
        points: 20,
        answer: "يكتبون: فعل مضارع مرفوع بثبوت النون لأنه من الأفعال الخمسة…",
      },
      {
        title: "عرض شفهي: شخصية مصرية ملهمة",
        brief:
          "حضّر عرضًا من ثلاث دقائق عن شخصية مصرية ملهمة، مع شرائح لا تزيد على خمس.",
        points: 20,
        answer: "اخترت الدكتور مجدي يعقوب: نشأته، وإنجازاته، ومؤسسته في أسوان.",
      },
      {
        title: "قراءة الفصل الرابع من «الأيام»",
        brief:
          "اقرأ الفصل الرابع من «الأيام» لطه حسين، واكتب خمسة أسئلة للنقاش في الفصل.",
        points: 20,
        answer: "1) كيف تعامل الصبي مع فقدان بصره؟ 2) ما دور الأم في حياته؟…",
      },
    ],
    english: [
      {
        title: "Essay: Is social media good for teenagers?",
        brief:
          "Write a 400-word discursive essay presenting both sides and your own conclusion. Use at least three linking phrases.",
        points: 20,
        answer:
          "Social media has transformed the way teenagers communicate. On the one hand, it keeps friends connected; on the other hand…",
      },
      {
        title: "'Of Mice and Men': chapter 3 analysis",
        brief:
          "How does Steinbeck present loneliness in chapter 3? Refer closely to the text in a PEE paragraph structure.",
        points: 20,
        answer:
          "Steinbeck presents loneliness through Candy's attachment to his old dog. When Carlson shoots it, Candy is left with nothing…",
      },
      {
        title: "Formal letter of complaint",
        brief:
          "Write a formal letter to a company about a faulty product you bought. Follow the conventions from the lesson.",
        points: 20,
        answer:
          "Dear Sir or Madam, I am writing to complain about the headphones I purchased on 3 October…",
      },
      {
        title: "Debate preparation: school uniforms",
        brief:
          "Prepare three arguments for your side and one rebuttal for the motion 'School uniforms should be abolished'.",
        points: 20,
        answer:
          "Against the motion: uniforms reduce peer pressure, save families money, build identity.",
      },
      {
        title: "Vocabulary: unit 4 word list",
        brief:
          "Learn the twenty words from unit 4 and write a sentence for ten of them.",
        points: 20,
        answer: "Reluctant: She was reluctant to speak in front of the class…",
      },
    ],
    mathematics: [
      {
        title: "Solving linear equations",
        brief:
          "Exercise 5B, questions 1 to 20. Questions 15 to 20 have unknowns on both sides.",
        points: 20,
        answer: "1) x = 4  2) x = −3  … 15) 3x + 5 = x − 7, x = −6",
      },
      {
        title: "Pythagoras' theorem in context",
        brief:
          "Solve the six real-life problems on the worksheet (ladders, ramps, TV screens). Draw a diagram for each.",
        points: 20,
        answer: "1) The ladder reaches 4.8 m up the wall …",
      },
      {
        title: "Probability experiment",
        brief:
          "Roll two dice 50 times and record the totals. Compare your results with the theoretical probabilities.",
        points: 20,
        answer:
          "Total 7 came up 9 times out of 50 (0.18); theory says 6/36 ≈ 0.17.",
      },
      {
        title: "Simultaneous equations",
        brief:
          "Exercise 7A, questions 1 to 12, by elimination and by substitution.",
        points: 20,
        answer: "1) x = 2, y = 3  2) x = −1, y = 4 …",
      },
      {
        title: "Statistics project: our class in numbers",
        brief:
          "Collect data on how your classmates travel to school. Present it with a pie chart and work out the mean journey time.",
        points: 20,
        answer: "Bus 45%, car 35%, walking 20%. Mean journey time 24 minutes.",
      },
    ],
    science: [
      {
        title: "Lab report: density of irregular objects",
        brief:
          "Write up the practical: method, results table, calculations and an evaluation of your errors.",
        points: 20,
        answer:
          "The stone had a mass of 54 g and displaced 20 cm³ of water, so its density is 2.7 g/cm³…",
      },
      {
        title: "Cells: plant and animal cell comparison",
        brief:
          "Draw and label a plant and an animal cell. Write a table comparing their organelles and functions.",
        points: 20,
        answer:
          "Both have a nucleus, cytoplasm and cell membrane; only plant cells have a cell wall and chloroplasts.",
      },
      {
        title: "Forces and motion: speed-time graphs",
        brief:
          "Answer questions 1 to 8 on interpreting speed-time graphs. Calculate acceleration where asked.",
        points: 20,
        answer: "Q3: acceleration = (20 − 5) / 5 = 3 m/s².",
      },
      {
        title: "Research: renewable energy in Egypt",
        brief:
          "Research the Benban solar park. Explain how it works and its benefits and drawbacks, in 300 words.",
        points: 20,
        answer:
          "Benban near Aswan is one of the largest solar parks in the world, producing about 1.6 GW…",
      },
      {
        title: "Periodic table quiz preparation",
        brief:
          "Learn the symbols and groups of the first 20 elements for next week's quiz.",
        points: 20,
        answer: "Revised with flashcards.",
      },
    ],
  },
};

/** One thing a KG class does at home, per subject, due within the week. */
const KG_ACTIVITIES: Record<Subject, { title: string; brief: string }> = {
  arabic: {
    title: "اِبْحَثْ عَنْ حَرْفِ الْمِيمِ",
    brief:
      "مَعَ أَحَدِ وَالِدَيْكَ، اِبْحَثُوا فِي الْبَيْتِ عَنْ ثَلَاثَةِ أَشْيَاءَ يَبْدَأُ اسْمُهَا بِحَرْفِ الْمِيمِ (مِثْلَ: مَوْز، مِفْتَاح، مِقَصّ).",
  },
  english: {
    title: "Show and tell: my favourite toy",
    brief:
      "Bring your favourite toy on Thursday and be ready to say its name and one thing you like about it.",
  },
  mathematics: {
    title: "Count and bring: 10 small stones",
    brief:
      "Collect ten small stones or buttons with your family, count them together and bring them in a bag.",
  },
  science: {
    title: "Leaf collection",
    brief:
      "Collect three different leaves from a garden or street. We will sort them by shape and colour in class.",
  },
};

const FEEDBACK: Record<"high" | "mid" | "low", string[]> = {
  high: [
    "Excellent work: clear, careful and well presented.",
    "Superb effort. Your explanation shows real understanding.",
    "Very well done. Try the extension question next time.",
    "Great detail and accurate throughout. Keep it up!",
  ],
  mid: [
    "Good work. Check your answers more carefully before handing in.",
    "A solid effort. Add more detail to explain your thinking.",
    "Well done on the first part; the last questions need more care.",
    "Good ideas. Watch your presentation and spelling.",
  ],
  low: [
    "Please come and see me so we can go through this together.",
    "You have made a start. Re-read the instructions and try again.",
    "Some good ideas here, but several parts are missing.",
  ],
};

const FEEDBACK_AR: Record<"high" | "mid" | "low", string[]> = {
  high: [
    "أحسنت! عمل متقن وخط جميل.",
    "ممتاز، إجابات دقيقة وواضحة. استمر.",
    "عمل رائع يدل على فهم عميق للدرس.",
  ],
  mid: [
    "جيد، راجع الإملاء قبل التسليم.",
    "مجهود طيب، أضف تفاصيل أكثر لإجابتك.",
    "أحسنت في الجزء الأول، والجزء الأخير يحتاج إلى مراجعة.",
  ],
  low: [
    "تعالَ إليّ لنراجع الدرس معًا.",
    "بداية جيدة، لكن بعض الأسئلة لم تُجب. حاول مرة أخرى.",
  ],
};

/** Days from today each of a term's five pieces of work was due. */
const DUE_OFFSETS = [-38, -17, -4, 3, 11];

async function coursework(
  tx: Tx,
  school: FilledSchool,
  classes: readonly TaughtClass[],
  today: string,
) {
  const roll = random(0xc0ffee);
  // Each child works at their own level all term, so a parent sees a
  // pattern rather than noise.
  const ability = new Map<string, number>();
  const levelOf = (studentId: string) => {
    let level = ability.get(studentId);
    if (level === undefined) {
      level = 0.55 + roll() * 0.43;
      ability.set(studentId, level);
    }
    return level;
  };
  const [term] = await tx
    .select({ id: academicSessions.id })
    .from(academicSessions)
    .where(
      and(
        eq(academicSessions.tenantId, school.tenantId),
        eq(academicSessions.schoolYearId, school.yearId),
        eq(academicSessions.type, "term"),
      ),
    )
    .orderBy(academicSessions.sequence)
    .limit(1);
  const rows = {
    assignments: [] as (typeof assignments.$inferInsert)[],
    documents: [] as (typeof documents.$inferInsert)[],
    recipients: [] as (typeof assignmentRecipients.$inferInsert)[],
    submissions: [] as (typeof submissions.$inferInsert)[],
    attempts: [] as (typeof submissionAttempts.$inferInsert)[],
    assessments: [] as (typeof assessments.$inferInsert)[],
  };
  const marks = new Map<
    string,
    { taught: TaughtClass; studentUserId: string; fractions: number[] }
  >();
  const brief = (hostId: string, text: string) =>
    rows.documents.push({
      tenantId: school.tenantId,
      hostType: "assignment",
      hostId,
      orgId: school.schoolId,
      kind: "rich_text",
      schemaVersion: 1,
      content: plainContent(text) as unknown as Record<string, unknown>,
      plainText: text,
    });
  for (const taught of classes) {
    const base = {
      tenantId: school.tenantId,
      orgId: school.schoolId,
      classId: taught.id,
      classType: "scheduled" as const,
      schoolYearId: school.yearId,
      gradingPeriodId: term?.id ?? null,
      authorUserId: taught.teacherId,
    };
    if (taught.band === "kg") {
      const activity = KG_ACTIVITIES[taught.subject];
      const id = Bun.randomUUIDv7();
      const due = schoolDay(addDays(today, 2));
      rows.assignments.push({
        ...base,
        id,
        title: activity.title,
        state: "published",
        submissionFormat: "none",
        availableFrom: at(addDays(today, -3), "07:00"),
        dueAt: at(due, "08:00"),
        publishedAt: at(addDays(today, -3), "07:00"),
      });
      brief(id, activity.brief);
      for (const studentUserId of taught.students)
        rows.recipients.push({
          tenantId: school.tenantId,
          assignmentId: id,
          studentUserId,
          source: "class",
        });
      continue;
    }
    const tasks = TASKS[taught.band][taught.subject];
    const arabic = taught.subject === "arabic";
    for (const [index, task] of tasks.entries()) {
      const offset = DUE_OFFSETS[index] ?? 0;
      const due = schoolDay(addDays(today, offset));
      const set = schoolDay(addDays(due, -7));
      const id = Bun.randomUUIDv7();
      rows.assignments.push({
        ...base,
        id,
        title: task.title,
        state: "published",
        submissionFormat: "online",
        availableFrom: at(set, "07:00"),
        dueAt: at(due, "20:00"),
        points: task.points,
        publishedAt: at(set, "07:00"),
      });
      brief(id, task.brief);
      for (const studentUserId of taught.students) {
        rows.recipients.push({
          tenantId: school.tenantId,
          assignmentId: id,
          studentUserId,
          source: "class",
        });
        const level = levelOf(studentUserId);
        const past = offset < 0;
        // Nearly everyone hands in past work, a few late; a few hand in
        // what is due soon early; nobody has started the last piece.
        const handsIn = past ? roll() < 0.95 : offset < 7 && roll() < 0.3;
        if (!handsIn) continue;
        const late = past && roll() < 0.06;
        const early = addDays(due, -1 - Math.floor(roll() * 3));
        const handedAt = late
          ? at(schoolDay(addDays(due, 1)), "16:40")
          : at(early < today ? early : addDays(today, -1), "18:20");
        const marked = offset <= -10 || (offset < 0 && roll() < 0.75);
        const returned = offset <= -10;
        const submissionId = Bun.randomUUIDv7();
        const attemptId = Bun.randomUUIDv7();
        rows.submissions.push({
          tenantId: school.tenantId,
          id: submissionId,
          assignmentId: id,
          studentUserId,
          state: returned ? "returned" : "submitted",
        });
        rows.attempts.push({
          tenantId: school.tenantId,
          id: attemptId,
          submissionId,
          studentUserId,
          number: 1,
          isLate: late,
          submittedAt: handedAt,
          submittedByUserId: studentUserId,
        });
        rows.documents.push({
          tenantId: school.tenantId,
          hostType: "submission_attempt",
          hostId: attemptId,
          orgId: school.schoolId,
          kind: "rich_text",
          schemaVersion: 1,
          content: plainContent(task.answer) as unknown as Record<
            string,
            unknown
          >,
          plainText: task.answer,
          frozenAt: handedAt,
        });
        if (!marked) continue;
        const fraction = Math.min(
          1,
          Math.max(0.3, level + (roll() - 0.5) * 0.2),
        );
        const score = Math.round(task.points * fraction);
        if (returned) {
          const key = `${taught.id}:${studentUserId}`;
          const sofar = marks.get(key) ?? {
            taught,
            studentUserId,
            fractions: [],
          };
          sofar.fractions.push(score / task.points);
          marks.set(key, sofar);
        }
        const tier =
          fraction >= 0.85 ? "high" : fraction >= 0.65 ? "mid" : "low";
        const pool = (arabic ? FEEDBACK_AR : FEEDBACK)[tier];
        rows.assessments.push({
          tenantId: school.tenantId,
          attemptId,
          submissionId,
          studentUserId,
          score,
          effectiveScore: score,
          feedback:
            returned && roll() < 0.7
              ? (pool[Math.floor(roll() * pool.length)] ?? null)
              : null,
          gradedByUserId: taught.teacherId,
          releasedAt: returned ? at(schoolDay(addDays(due, 4)), "15:00") : null,
        });
      }
    }
    const draftId = Bun.randomUUIDv7();
    rows.assignments.push({
      ...base,
      id: draftId,
      title: arabic ? "مراجعة نهاية الوحدة" : "End of unit review",
      submissionFormat: "online",
      points: 20,
    });
    brief(
      draftId,
      arabic
        ? "أسئلة مراجعة على الوحدة كاملة قبل الاختبار."
        : "Review questions covering the whole unit, before the test.",
    );
  }
  await chunked(rows.assignments, (part) =>
    tx.insert(assignments).values(part),
  );
  await chunked(rows.documents, (part) => tx.insert(documents).values(part));
  await chunked(rows.recipients, (part) =>
    tx.insert(assignmentRecipients).values(part),
  );
  await chunked(rows.submissions, (part) =>
    tx.insert(submissions).values(part),
  );
  await chunked(rows.attempts, (part) =>
    tx.insert(submissionAttempts).values(part),
  );
  await chunked(rows.assessments, (part) =>
    tx.insert(assessments).values(part),
  );
  // A term-to-date grade in each subject, released for the mid-term
  // progress report: the mean of the work marked so far.
  if (!term) return;
  const grades: (typeof periodGrades.$inferInsert)[] = [];
  for (const { taught, studentUserId, fractions } of marks.values()) {
    const mean =
      fractions.reduce((sum, one) => sum + one, 0) / fractions.length;
    const tier = mean >= 0.85 ? "high" : mean >= 0.65 ? "mid" : "low";
    const pool = (taught.subject === "arabic" ? REPORT_AR : REPORT)[tier];
    grades.push({
      tenantId: school.tenantId,
      orgId: school.schoolId,
      classId: taught.id,
      classType: "scheduled",
      schoolYearId: school.yearId,
      gradingPeriodId: term.id,
      studentUserId,
      score: Math.round(mean * 100),
      comment: pool[Math.floor(roll() * pool.length)] ?? null,
      recordedByUserId: taught.teacherId,
      releasedAt: at(schoolDay(addDays(today, -7)), "15:00"),
    });
  }
  await chunked(grades, (part) => tx.insert(periodGrades).values(part));
}

const REPORT: Record<"high" | "mid" | "low", string[]> = {
  high: [
    "An excellent start to the year. Consistently careful, thoughtful work.",
    "Works with real enthusiasm and contributes well in class.",
    "Strong progress this half term. Ready for more challenge.",
  ],
  mid: [
    "Good progress. Checking work before handing it in would lift the next grade.",
    "A positive start; more detail in written answers is the next step.",
    "Steady effort and good behaviour. Keep reading at home.",
  ],
  low: [
    "Finding some topics hard; extra practice at home will help. Please see me at parents' evening.",
    "Needs to hand work in on time and ask for help when stuck.",
  ],
};

const REPORT_AR: Record<"high" | "mid" | "low", string[]> = {
  high: [
    "بداية ممتازة، عمل متقن ومشاركة فعالة.",
    "مستوى رائع، استمر على هذا الأداء.",
  ],
  mid: [
    "تقدم جيد، يحتاج إلى مزيد من القراءة اليومية.",
    "مستوى طيب، مع الاهتمام بالإملاء.",
  ],
  low: ["يحتاج إلى متابعة في المنزل، أرجو التواصل في لقاء أولياء الأمور."],
};
// ---------------------------------------------------------------------------
// Learning

interface LessonPlan {
  title: string;
  completion: LessonCompletion;
  blocks: LessonBlock[];
}

interface ModulePlan {
  title: string;
  summary: string;
  lessons: LessonPlan[];
}

const blockId = () => Bun.randomUUIDv7();

const reading = (text: string): LessonBlock => ({
  id: blockId(),
  type: "content",
  content: headedContent(
    text.split("\n\n").map((paragraph) => ({
      heading: "",
      body: plainContent(paragraph),
    })),
  ),
});

const choice = (
  prompt: string,
  right: string,
  wrong: string[],
  explanation = "",
): LessonBlock => {
  const rightId = blockId();
  return {
    id: blockId(),
    type: "choice",
    prompt,
    points: 1,
    hints: [],
    explanation,
    tries: null,
    options: [
      { id: rightId, text: right, feedback: "" },
      ...wrong.map((text) => ({ id: blockId(), text, feedback: "" })),
    ],
    correctOptionIds: [rightId],
    multiple: false,
    shuffle: true,
  };
};

const counting = (prompt: string, count: number): LessonBlock => ({
  id: blockId(),
  type: "counting",
  prompt,
  points: 1,
  hints: [],
  explanation: "",
  tries: null,
  count,
  mode: "count",
  layout: "scatter",
  flashSeconds: null,
});

const spelling = (
  prompt: string,
  tiles: string[],
  extras: string[],
): LessonBlock => ({
  id: blockId(),
  type: "spelling",
  prompt,
  points: 1,
  hints: [],
  explanation: "",
  tries: null,
  tiles,
  extras,
});

const matching = (prompt: string, pairs: [string, string][]): LessonBlock => ({
  id: blockId(),
  type: "matching",
  prompt,
  points: pairs.length,
  hints: [],
  explanation: "",
  tries: null,
  pairs: pairs.map(([left, answer]) => ({
    id: blockId(),
    prompt: left,
    answer,
  })),
  distractors: [],
});

const sorting = (prompt: string, groups: [string, string[]][]): LessonBlock => {
  const named = groups.map(([name, items]) => ({ id: blockId(), name, items }));
  return {
    id: blockId(),
    type: "sorting",
    prompt,
    points: groups.reduce((sum, [, items]) => sum + items.length, 0),
    hints: [],
    explanation: "",
    tries: null,
    groups: named.map(({ id, name }) => ({ id, name })),
    items: named.flatMap(({ id, items }) =>
      items.map((text) => ({ id: blockId(), text, groupId: id })),
    ),
  };
};

const written = (prompt: string, points = 4): LessonBlock => ({
  id: blockId(),
  type: "written",
  prompt,
  points,
  hints: [],
  explanation: "",
  tries: null,
  wordLimit: 200,
});

/** Young children's lessons: short, spoken aloud, one thing at a time. */
function kgModules(): Record<Subject, ModulePlan> {
  return {
    arabic: {
      title: "حُرُوفِي الْأُولَى",
      summary: "نَتَعَرَّفُ عَلَى أَصْوَاتِ الْحُرُوفِ وَنُكَوِّنُ كَلِمَاتٍ صَغِيرَةً.",
      lessons: [
        {
          title: "حَرْفُ الْمِيمِ",
          completion: "view",
          blocks: [
            reading(
              "هَذَا حَرْفُ الْمِيمِ: م\n\nمَوْزٌ يَبْدَأُ بِالْمِيمِ. مِفْتَاحٌ يَبْدَأُ بِالْمِيمِ. مَامَا تَبْدَأُ بِالْمِيمِ.",
            ),
          ],
        },
        {
          title: "أَيُّ كَلِمَةٍ تَبْدَأُ بِالْمِيمِ؟",
          completion: "quiz",
          blocks: [
            choice("أَيُّ كَلِمَةٍ تَبْدَأُ بِحَرْفِ الْمِيمِ؟", "مَوْز", ["تُفَّاح", "بُرْتُقَال"]),
            choice("أَيُّ كَلِمَةٍ تَبْدَأُ بِحَرْفِ الْبَاءِ؟", "بَابٌ", ["قَلَمٌ", "نَارٌ"]),
          ],
        },
        {
          title: "نُكَوِّنُ كَلِمَةً",
          completion: "quiz",
          blocks: [spelling("كَوِّنْ كَلِمَةَ «بَاب»", ["ب", "ا", "ب"], ["م"])],
        },
      ],
    },
    english: {
      title: "Letters and sounds",
      summary: "Hear, say and find the first sounds of words.",
      lessons: [
        {
          title: "The letter s",
          completion: "view",
          blocks: [
            reading(
              "This is the letter s. It says sss, like a snake.\n\nSun starts with s. Sock starts with s. Star starts with s.",
            ),
          ],
        },
        {
          title: "Which word starts with s?",
          completion: "quiz",
          blocks: [
            choice("Which word starts with s?", "sun", ["cat", "dog"]),
            choice("Which word starts with m?", "moon", ["bed", "hat"]),
          ],
        },
        {
          title: "Build a word",
          completion: "quiz",
          blocks: [spelling("Build the word cat", ["c", "a", "t"], ["s"])],
        },
      ],
    },
    mathematics: {
      title: "Counting to 10",
      summary: "Count objects, match numbers and spot more and fewer.",
      lessons: [
        {
          title: "Count with me",
          completion: "quiz",
          blocks: [
            counting("How many can you count?", 4),
            counting("How many now?", 7),
          ],
        },
        {
          title: "Match the numbers",
          completion: "quiz",
          blocks: [
            matching("Match each number to its word", [
              ["3", "three"],
              ["5", "five"],
              ["8", "eight"],
            ]),
          ],
        },
        {
          title: "More or fewer?",
          completion: "quiz",
          blocks: [
            choice("Which is more?", "9", ["4"]),
            choice("Which is fewer?", "2", ["6"]),
          ],
        },
      ],
    },
    science: {
      title: "Living things around us",
      summary: "Animals, plants and what they need to grow.",
      lessons: [
        {
          title: "What do plants need?",
          completion: "view",
          blocks: [
            reading(
              "Plants need water, sunlight and air to grow.\n\nWe water our class plant every morning.",
            ),
          ],
        },
        {
          title: "Animal homes",
          completion: "quiz",
          blocks: [
            matching("Match each animal to its home", [
              ["bird", "nest"],
              ["bee", "hive"],
              ["fish", "water"],
            ]),
          ],
        },
        {
          title: "Living or not living?",
          completion: "quiz",
          blocks: [
            sorting("Sort these", [
              ["Living", ["cat", "tree", "fish"]],
              ["Not living", ["chair", "ball", "spoon"]],
            ]),
          ],
        },
      ],
    },
  };
}

/** One module per subject and age, the one each class is working through now. */
function schoolModules(): Record<
  Exclude<Band, "kg">,
  Record<Subject, ModulePlan>
> {
  return {
    lower: {
      arabic: {
        title: "الْمَدُّ بِالْأَلِفِ وَالْوَاوِ وَالْيَاءِ",
        summary: "نَقْرَأُ كَلِمَاتٍ فِيهَا مَدٌّ وَنُمَيِّزُ بَيْنَ أَنْوَاعِهِ.",
        lessons: [
          {
            title: "مَا هُوَ الْمَدُّ؟",
            completion: "view",
            blocks: [
              reading(
                "الْمَدُّ صَوْتٌ طَوِيلٌ. نَقُولُ: بَااااب.\n\nالْمَدُّ بِالْأَلِفِ: بَاب. الْمَدُّ بِالْوَاوِ: نُور. الْمَدُّ بِالْيَاءِ: فِيل.",
              ),
            ],
          },
          {
            title: "نُمَيِّزُ نَوْعَ الْمَدِّ",
            completion: "quiz",
            blocks: [
              sorting("صَنِّفِ الْكَلِمَاتِ حَسَبَ نَوْعِ الْمَدِّ", [
                ["مَدٌّ بِالْأَلِفِ", ["نَارٌ", "بَابٌ"]],
                ["مَدٌّ بِالْوَاوِ", ["نُورٌ", "فُولٌ"]],
                ["مَدٌّ بِالْيَاءِ", ["فِيلٌ", "تِينٌ"]],
              ]),
            ],
          },
        ],
      },
      english: {
        title: "Reading stories together",
        summary: "Characters, settings and what happens next.",
        lessons: [
          {
            title: "What makes a story",
            completion: "view",
            blocks: [
              reading(
                "Every story has characters: the people or animals in it.\n\nIt has a setting: where and when it happens.\n\nAnd it has a problem that gets solved by the end.",
              ),
            ],
          },
          {
            title: "Check your understanding",
            completion: "quiz",
            blocks: [
              choice(
                "Where and when a story happens is called the…",
                "setting",
                ["character", "title"],
                "The setting is where and when a story happens.",
              ),
              choice(
                "Which is a character in 'The Three Little Pigs'?",
                "the wolf",
                ["the house", "the forest"],
              ),
            ],
          },
        ],
      },
      mathematics: {
        title: "Place value to 100",
        summary: "Tens and ones, and comparing numbers.",
        lessons: [
          {
            title: "Tens and ones",
            completion: "view",
            blocks: [
              reading(
                "In 47 there are 4 tens and 7 ones.\n\n4 tens is 40. 40 and 7 make 47.",
              ),
            ],
          },
          {
            title: "Practice: tens and ones",
            completion: "quiz",
            blocks: [
              matching("Match each number to its tens and ones", [
                ["36", "3 tens and 6 ones"],
                ["63", "6 tens and 3 ones"],
                ["90", "9 tens and 0 ones"],
              ]),
              choice("Which number is greater?", "71", ["17"]),
            ],
          },
        ],
      },
      science: {
        title: "Plants and how they grow",
        summary: "Parts of a plant and what each part does.",
        lessons: [
          {
            title: "Parts of a plant",
            completion: "view",
            blocks: [
              reading(
                "Roots take in water from the soil.\n\nThe stem carries water up the plant.\n\nLeaves use sunlight to make food.",
              ),
            ],
          },
          {
            title: "Check: plant parts",
            completion: "quiz",
            blocks: [
              matching("Match the part to its job", [
                ["roots", "take in water"],
                ["stem", "carries water up"],
                ["leaves", "make food"],
              ]),
            ],
          },
        ],
      },
    },
    upper: {
      arabic: {
        title: "النعت والمنعوت",
        summary: "نتعرف على النعت ونطابقه مع المنعوت.",
        lessons: [
          {
            title: "تعريف النعت",
            completion: "view",
            blocks: [
              reading(
                "النعت اسم يصف اسمًا قبله، ويتبعه في الإعراب.\n\nمثال: قرأتُ كتابًا مفيدًا. «مفيدًا» نعت منصوب لأن المنعوت «كتابًا» منصوب.",
              ),
            ],
          },
          {
            title: "تدريب على النعت",
            completion: "quiz",
            blocks: [
              choice("في جملة «زرنا مدينةً قديمةً»، ما النعت؟", "قديمة", [
                "زرنا",
                "مدينة",
              ]),
              choice("النعت يتبع المنعوت في…", "الإعراب", [
                "العدد فقط",
                "لا شيء",
              ]),
            ],
          },
          {
            title: "اكتب جملًا",
            completion: "reflection",
            blocks: [
              written("اكتب ثلاث جمل في كل منها نعت، وضع خطًّا تحت النعت."),
            ],
          },
        ],
      },
      english: {
        title: "Persuasive writing",
        summary: "Techniques writers use to convince their readers.",
        lessons: [
          {
            title: "Persuasive techniques",
            completion: "view",
            blocks: [
              reading(
                "Persuasive writers use facts and statistics, emotive language, rhetorical questions and repetition.\n\nWouldn't you agree that every child deserves a safe place to play?",
              ),
            ],
          },
          {
            title: "Spot the technique",
            completion: "quiz",
            blocks: [
              choice(
                "'Wouldn't you agree?' is an example of…",
                "a rhetorical question",
                ["a statistic", "a simile"],
              ),
              choice(
                "'Nine out of ten children prefer…' is an example of…",
                "a statistic",
                ["repetition", "a rhetorical question"],
              ),
            ],
          },
          {
            title: "Your turn",
            completion: "reflection",
            blocks: [
              written(
                "Write a short paragraph persuading your class to recycle more. Use at least two techniques.",
              ),
            ],
          },
        ],
      },
      mathematics: {
        title: "Fractions",
        summary: "Equivalent fractions, comparing and simplifying.",
        lessons: [
          {
            title: "Equivalent fractions",
            completion: "view",
            blocks: [
              reading(
                "Equivalent fractions show the same amount.\n\n1/2 = 2/4 = 4/8. Multiply or divide the top and bottom by the same number.",
              ),
            ],
          },
          {
            title: "Practice: fractions",
            completion: "quiz",
            blocks: [
              choice("Which fraction is equal to 3/4?", "6/8", ["3/8", "4/6"]),
              choice("Simplify 10/15", "2/3", ["1/3", "5/3"]),
              matching("Match equivalent fractions", [
                ["1/2", "5/10"],
                ["1/3", "3/9"],
                ["3/5", "6/10"],
              ]),
            ],
          },
        ],
      },
      science: {
        title: "The water cycle",
        summary: "How water moves between the sea, the sky and the land.",
        lessons: [
          {
            title: "Evaporation and condensation",
            completion: "view",
            blocks: [
              reading(
                "The Sun heats water in seas and rivers, and it evaporates into water vapour.\n\nHigh in the sky the vapour cools and condenses into clouds.\n\nWhen the droplets get heavy, they fall as precipitation.",
              ),
            ],
          },
          {
            title: "Check: the water cycle",
            completion: "quiz",
            blocks: [
              choice(
                "Water vapour cooling into droplets is called…",
                "condensation",
                ["evaporation", "collection"],
              ),
              {
                id: blockId(),
                type: "ordering",
                prompt: "Put the stages in order",
                points: 1,
                hints: [],
                explanation: "",
                tries: null,
                scoring: "all",
                items: [
                  { id: blockId(), text: "evaporation" },
                  { id: blockId(), text: "condensation" },
                  { id: blockId(), text: "precipitation" },
                  { id: blockId(), text: "collection" },
                ],
              },
            ],
          },
        ],
      },
    },
    middle: {
      arabic: {
        title: "الأفعال الخمسة",
        summary: "تعريفها، وعلامات إعرابها، وتطبيقات عليها.",
        lessons: [
          {
            title: "ما الأفعال الخمسة؟",
            completion: "view",
            blocks: [
              reading(
                "الأفعال الخمسة كل فعل مضارع اتصلت به ألف الاثنين أو واو الجماعة أو ياء المخاطبة.\n\nتُرفع بثبوت النون، وتُنصب وتُجزم بحذفها: يكتبون، لن يكتبوا، لم يكتبوا.",
              ),
            ],
          },
          {
            title: "تدريب",
            completion: "quiz",
            blocks: [
              choice("«الطلاب لم يتأخروا» الفعل مجزوم بـ…", "حذف النون", [
                "السكون",
                "الفتحة",
              ]),
              choice("أي الأفعال التالية من الأفعال الخمسة؟", "تدرسين", [
                "تدرس",
                "درسَ",
              ]),
            ],
          },
        ],
      },
      english: {
        title: "'Of Mice and Men'",
        summary: "Characters, themes and Steinbeck's methods.",
        lessons: [
          {
            title: "The American Dream",
            completion: "view",
            blocks: [
              reading(
                "George and Lennie dream of owning a small farm and 'living off the fatta the lan''.\n\nSteinbeck uses the dream to show hope, and its loss to show how hard life was for migrant workers in the Great Depression.",
              ),
            ],
          },
          {
            title: "Check your reading",
            completion: "quiz",
            blocks: [
              choice("Where is the novel set?", "California", [
                "Texas",
                "New York",
              ]),
              choice("Who owns the old dog?", "Candy", ["Curley", "Slim"]),
            ],
          },
          {
            title: "Theme paragraph",
            completion: "reflection",
            blocks: [
              written(
                "How does Steinbeck present loneliness through Crooks? Write one PEE paragraph.",
                6,
              ),
            ],
          },
        ],
      },
      mathematics: {
        title: "Linear equations",
        summary: "Solving equations, including unknowns on both sides.",
        lessons: [
          {
            title: "Balancing equations",
            completion: "view",
            blocks: [
              reading(
                "An equation is like a balance: whatever you do to one side, do to the other.\n\n3x + 4 = 19 → 3x = 15 → x = 5.",
              ),
            ],
          },
          {
            title: "Practice: solve for x",
            completion: "quiz",
            blocks: [
              choice("Solve 2x + 6 = 20", "x = 7", ["x = 13", "x = 8"]),
              choice("Solve 5x − 3 = 2x + 9", "x = 4", ["x = 2", "x = 6"]),
            ],
          },
        ],
      },
      science: {
        title: "Cells and organisation",
        summary:
          "Plant and animal cells, and how cells form tissues and organs.",
        lessons: [
          {
            title: "Inside a cell",
            completion: "view",
            blocks: [
              reading(
                "The nucleus controls the cell. The cell membrane controls what goes in and out.\n\nPlant cells also have a cell wall for support and chloroplasts for photosynthesis.",
              ),
            ],
          },
          {
            title: "Check: organelles",
            completion: "quiz",
            blocks: [
              matching("Match the organelle to its job", [
                ["nucleus", "controls the cell"],
                ["chloroplast", "photosynthesis"],
                ["cell wall", "support"],
              ]),
              choice("Which is found only in plant cells?", "cell wall", [
                "nucleus",
                "cell membrane",
              ]),
            ],
          },
        ],
      },
    },
  };
}

async function learning(
  tx: Tx,
  school: FilledSchool,
  classes: readonly TaughtClass[],
  today: string,
) {
  for (const feature of ["elearning", "early_years"] as const)
    await setOrgFeature(tx, {
      tenantId: school.tenantId,
      orgId: school.schoolId,
      feature,
      enabled: true,
    });
  const roll = random(0x1ea4);
  const kg = kgModules();
  const older = schoolModules();
  // One module per subject and grade, shared by the grade's sections and
  // written by the grade's first subject teacher.
  const groups = new Map<string, TaughtClass[]>();
  for (const taught of classes) {
    const key = `${taught.grade}:${taught.subject}`;
    groups.set(key, [...(groups.get(key) ?? []), taught]);
  }
  for (const group of groups.values()) {
    const [first] = group;
    if (!first) continue;
    const young = first.band === "kg";
    const plan =
      first.band === "kg"
        ? kg[first.subject]
        : older[first.band][first.subject];
    const created = await insertModule(tx, {
      tenantId: school.tenantId,
      schoolId: school.schoolId,
      yearId: school.yearId,
      authorId: first.teacherId,
      title: plan.title,
      summary: plan.summary,
      sequential: true,
      prerequisiteId: null,
      prerequisiteScore: null,
      practiceBands: [],
    });
    await setModuleClasses(tx, {
      tenantId: school.tenantId,
      moduleId: created.id,
      classIds: group.map((taught) => taught.homeroomId),
    });
    const lessonIds: string[] = [];
    for (const lesson of plan.lessons) {
      const row = await insertLesson(tx, {
        tenantId: school.tenantId,
        moduleId: created.id,
        title: lesson.title,
        completion: lesson.completion,
        passScore: null,
        review: false,
        vowelMarks: "shown",
        language: null,
        translationTitle: null,
        young,
        readAlong: true,
        condition: null,
        bands: [],
      });
      lessonIds.push(row.id);
      const content = contentOfLesson({ version: 2, blocks: lesson.blocks });
      if (!content) throw new Error(`${lesson.title} cannot be a document`);
      const document = await saveDocument(tx, {
        tenantId: school.tenantId,
        orgId: school.schoolId,
        host: { type: "lesson", id: row.id },
        kind: "lesson",
        content: { ...content },
        plainText: contentPlainText(content),
        mediaIds: contentFileIds(content),
        userId: first.teacherId,
      });
      await snapshotPublish(tx, {
        tenantId: school.tenantId,
        documentId: document.id,
        userId: first.teacherId,
      });
    }
    await setModuleState(tx, {
      tenantId: school.tenantId,
      id: created.id,
      expectedVersion: created.version,
      state: "published",
      publishAt: at(addDays(today, -12), "07:00").toISOString(),
    });
    // Most of the class has read the opening lesson; some are further on.
    const [opening] = lessonIds;
    if (!opening || plan.lessons[0]?.completion !== "view") continue;
    for (const studentId of group.flatMap((taught) => taught.students))
      if (roll() < 0.65)
        await recordProgress(tx, {
          tenantId: school.tenantId,
          lessonId: opening,
          studentId,
          completed: { by: "student" },
        });
  }
}

// ---------------------------------------------------------------------------
// Conversations

type Line = [
  from: "teacher" | "family",
  daysAgo: number,
  time: string,
  text: string,
];

/**
 * What a teacher and a family write about in a term, start to finish, and
 * the ages each fits. No line names the child by a pronoun, which would be
 * wrong for half the class.
 */
const FAMILY_THREADS: {
  subject: Subject | null;
  bands: readonly Band[];
  lines: Line[];
}[] = [
  {
    subject: null,
    bands: ["kg", "lower", "upper", "middle"],
    lines: [
      [
        "family",
        6,
        "19:42",
        "Good evening, {child} was unwell this morning and stayed home today. We expect {child} back tomorrow.",
      ],
      [
        "teacher",
        6,
        "20:05",
        "Thank you for letting me know. I hope {child} feels better soon; I'll keep today's worksheets.",
      ],
      [
        "family",
        5,
        "07:10",
        "Much better this morning, thank you. {child} will be in today.",
      ],
    ],
  },
  {
    subject: "mathematics",
    bands: ["upper", "middle"],
    lines: [
      [
        "teacher",
        9,
        "14:20",
        "Dear parent, {child} did very well in today's maths quiz: 9 out of 10. Please pass on my congratulations!",
      ],
      [
        "family",
        9,
        "18:55",
        "That's wonderful news, thank you! {child} has been practising at home every evening.",
      ],
    ],
  },
  {
    subject: null,
    bands: ["lower", "upper"],
    lines: [
      [
        "family",
        3,
        "08:30",
        "Hello, could we meet to talk about {child}'s reading? The new books seem quite difficult.",
      ],
      [
        "teacher",
        3,
        "13:15",
        "Of course. I'm free on Tuesday at 2:30 or Wednesday at 1:45. Which suits you better?",
      ],
      ["family", 3, "16:02", "Tuesday at 2:30 works well. Thank you."],
      [
        "teacher",
        2,
        "07:40",
        "Great, see you on Tuesday. I'll bring some of {child}'s recent work so we can look at it together.",
      ],
    ],
  },
  {
    subject: "science",
    bands: ["upper"],
    lines: [
      [
        "teacher",
        12,
        "15:00",
        "Hello, {child} has not handed in the water cycle diagram yet. Could you send a reminder? Sunday is fine.",
      ],
      [
        "family",
        11,
        "21:10",
        "Sorry about that, it was left at the grandparents' house. {child} will bring it on Sunday.",
      ],
      [
        "teacher",
        8,
        "12:30",
        "Received, thank you. It's a lovely piece of work.",
      ],
    ],
  },
  {
    subject: null,
    bands: ["upper"],
    lines: [
      [
        "family",
        1,
        "20:15",
        "Hi, is the Children's Museum trip still on? What time should {child} arrive that morning?",
      ],
    ],
  },
  {
    subject: "english",
    bands: ["lower", "upper"],
    lines: [
      [
        "teacher",
        15,
        "11:05",
        "I wanted to share that {child} read a story aloud to the class today, confidently and with lots of expression. Well done!",
      ],
      [
        "family",
        15,
        "17:40",
        "Thank you so much for telling us. {child} talked about it all evening!",
      ],
    ],
  },
  {
    subject: null,
    bands: ["kg", "lower", "upper", "middle"],
    lines: [
      [
        "family",
        4,
        "07:05",
        "Good morning. {child} has a dentist appointment at 11:00 today; I will collect {child} from the office at 10:30.",
      ],
      [
        "teacher",
        4,
        "07:25",
        "Noted, thank you. {child} will be ready at the office at 10:30.",
      ],
    ],
  },
  {
    subject: "arabic",
    bands: ["lower", "upper", "middle"],
    lines: [
      [
        "teacher",
        7,
        "13:50",
        "مساء الخير، تحسّن مستوى {child} كثيرًا في الإملاء هذا الشهر. أرجو التشجيع على القراءة اليومية.",
      ],
      ["family", 7, "19:30", "شكرًا جزيلًا يا أستاذ، سنحرص على ذلك."],
    ],
  },
  {
    subject: null,
    bands: ["upper", "middle"],
    lines: [
      [
        "family",
        2,
        "21:35",
        "Hello, {child} mentioned a test on Sunday. Which units should be revised?",
      ],
      [
        "teacher",
        1,
        "08:10",
        "Hello! The test covers units 3 and 4. The revision sheet is attached to Thursday's lesson in the app.",
      ],
    ],
  },
  {
    subject: null,
    bands: ["kg", "lower"],
    lines: [
      [
        "teacher",
        10,
        "14:45",
        "Dear parent, {child} seemed tired and quiet in class this week. Is everything all right at home?",
      ],
      [
        "family",
        10,
        "20:20",
        "Thank you for noticing. We moved house last week and bedtimes have slipped. We'll get back to the routine.",
      ],
      [
        "teacher",
        9,
        "07:50",
        "Thank you for explaining. Moving is a big change; I'll keep an eye on {child} and let you know how things go.",
      ],
    ],
  },
  {
    subject: null,
    bands: ["kg"],
    lines: [
      [
        "teacher",
        8,
        "13:30",
        "Hello! {child} made a beautiful leaf collage today and was very proud of it. It's on our classroom wall.",
      ],
      [
        "family",
        8,
        "18:10",
        "How lovely, thank you for sharing! We'll come and see it at pick-up.",
      ],
    ],
  },
  {
    subject: null,
    bands: ["kg", "lower"],
    lines: [
      [
        "family",
        5,
        "07:20",
        "Good morning, {child}'s grandmother will collect from school today at 1:30. Her name is on the pick-up list.",
      ],
      [
        "teacher",
        5,
        "07:45",
        "Thank you, noted. We'll check her ID at the gate as usual.",
      ],
    ],
  },
];

const STAFF_THREADS: {
  subject: string;
  lines: [daysAgo: number, time: string, text: string][];
}[] = [
  {
    subject: "Parents' evening planning",
    lines: [
      [
        5,
        "14:10",
        "Parents' evening slots are open for booking. Please check your timetable in the app and block any times you can't do.",
      ],
      [
        5,
        "14:32",
        "I can't do the first slot on the second evening; I have a hospital appointment.",
      ],
      [4, "08:05", "Noted, I've blocked it. Thanks everyone."],
    ],
  },
  {
    subject: "Science fair: judges needed",
    lines: [
      [
        3,
        "12:40",
        "We need four judges for the grade 4–6 science fair. Any volunteers?",
      ],
      [3, "13:02", "Happy to help with the grade 5 projects."],
      [2, "09:15", "Count me in too."],
    ],
  },
  {
    subject: "Term 1 reports",
    lines: [
      [
        1,
        "15:20",
        "Reminder: draft comments for term 1 reports are due by the end of the month. The comment bank is in the shared library.",
      ],
    ],
  },
];

async function conversations(
  tx: Tx,
  school: FilledSchool,
  classes: readonly TaughtClass[],
  today: string,
) {
  const roll = random(0x7a1c);
  const names = new Map(
    (
      await tx.execute<{
        id: string;
        given: string | null;
        family: string | null;
        ar: string | null;
      }>(sql`
        select id, given_name_en as given, family_name_en as family, given_name_ar as ar
        from core.users where tenant_id = ${school.tenantId}::uuid`)
    ).map((row) => [row.id, row]),
  );
  const guardians = new Map<string, string[]>();
  for (const row of await tx.execute<{ student: string; guardian: string }>(sql`
    select l.student_user_id as student, l.related_user_id as guardian
    from core.user_relationships l
    where l.tenant_id = ${school.tenantId}::uuid
      and app.guardian_permits(l, ${today}::date, 'contact')
    order by l.contact_priority, l.related_user_id`))
    guardians.set(row.student, [
      ...(guardians.get(row.student) ?? []),
      row.guardian,
    ]);
  const threads: (typeof messageThreads.$inferInsert)[] = [];
  const members: (typeof threadMembers.$inferInsert)[] = [];
  const posts: (typeof messages.$inferInsert)[] = [];
  const homerooms = new Map<string, TaughtClass[]>();
  for (const taught of classes)
    homerooms.set(taught.homeroomId, [
      ...(homerooms.get(taught.homeroomId) ?? []),
      taught,
    ]);
  const used = new Map<string, Set<(typeof FAMILY_THREADS)[number]>>();
  for (const subjects of homerooms.values()) {
    const [anyClass] = subjects;
    if (!anyClass) continue;
    // A handful of families in each class have something to talk about.
    const students = anyClass.students.filter(() => roll() < 0.22);
    const fitting = FAMILY_THREADS.filter((script) =>
      script.bands.includes(anyClass.band),
    );
    for (const student of students) {
      const family = guardians.get(student) ?? [];
      if (family.length === 0) continue;
      const teacherOf = (script: (typeof fitting)[number]) =>
        (script.subject
          ? subjects.find((one) => one.subject === script.subject)?.teacherId
          : null) ?? anyClass.homeroomTeacherId;
      // A teacher has each conversation once: the same words to three
      // families in a row would give the demonstration away.
      const start = Math.floor(roll() * fitting.length);
      const script = [...fitting.slice(start), ...fitting.slice(0, start)].find(
        (one) => !used.get(teacherOf(one))?.has(one),
      );
      if (!script) continue;
      const teacherId = teacherOf(script);
      used.set(teacherId, new Set([...(used.get(teacherId) ?? []), script]));
      const shift = Math.floor(roll() * 5);
      const child = names.get(student);
      const fill = (text: string) =>
        text.replaceAll(
          "{child}",
          (/[؀-ۿ]/.test(text) ? child?.ar : child?.given) ?? "",
        );
      const threadId = Bun.randomUUIDv7();
      const last = script.lines.at(-1);
      if (!last) continue;
      const lastAt = at(addDays(today, -(last[1] + shift)), last[2]);
      // A family's last word stays unread for the teacher, as it would.
      const teacherRead = last[0] === "teacher" ? lastAt : null;
      threads.push({
        tenantId: school.tenantId,
        id: threadId,
        orgId: school.schoolId,
        kind: "family",
        studentUserId: student,
        createdByUserId:
          script.lines[0]?.[0] === "teacher" ? teacherId : family[0],
        lastMessageAt: lastAt,
      });
      members.push(
        {
          tenantId: school.tenantId,
          threadId,
          userId: teacherId,
          role: "owner",
          joinedAt: at(
            addDays(today, -((script.lines[0]?.[1] ?? 0) + shift)),
            "06:00",
          ),
          lastReadAt: teacherRead,
        },
        ...family.map((userId) => ({
          tenantId: school.tenantId,
          threadId,
          userId,
          joinedAt: at(
            addDays(today, -((script.lines[0]?.[1] ?? 0) + shift)),
            "06:00",
          ),
          lastReadAt: last[0] === "family" ? lastAt : null,
        })),
      );
      for (const [from, daysAgo, time, text] of script.lines)
        posts.push({
          tenantId: school.tenantId,
          threadId,
          authorUserId:
            from === "teacher" ? teacherId : (family[0] ?? teacherId),
          body: fill(text),
          createdAt: at(addDays(today, -(daysAgo + shift)), time),
        });
    }
  }
  const staff = [...new Set(classes.map((taught) => taught.teacherId))];
  for (const script of STAFF_THREADS) {
    const threadId = Bun.randomUUIDv7();
    const last = script.lines.at(-1);
    if (!last) continue;
    threads.push({
      tenantId: school.tenantId,
      id: threadId,
      orgId: school.schoolId,
      kind: "group",
      subject: script.subject,
      createdByUserId: school.principalId,
      lastMessageAt: at(addDays(today, -last[0]), last[1]),
    });
    members.push(
      ...[school.principalId, ...staff].map((userId) => ({
        tenantId: school.tenantId,
        threadId,
        userId,
        role:
          userId === school.principalId
            ? ("owner" as const)
            : ("member" as const),
        joinedAt: at(addDays(today, -(script.lines[0]?.[0] ?? 0)), "06:00"),
        lastReadAt:
          userId === school.principalId
            ? at(addDays(today, -last[0]), last[1])
            : null,
      })),
    );
    for (const [index, [daysAgo, time, text]] of script.lines.entries())
      posts.push({
        tenantId: school.tenantId,
        threadId,
        authorUserId:
          index === 0
            ? school.principalId
            : (staff[index * 3] ?? school.principalId),
        body: text,
        createdAt: at(addDays(today, -daysAgo), time),
      });
  }
  await chunked(threads, (part) => tx.insert(messageThreads).values(part));
  await chunked(members, (part) => tx.insert(threadMembers).values(part));
  await chunked(posts, (part) => tx.insert(messages).values(part));
  const seeded = threads.map((thread) => thread.id ?? "");
  const stored = await tx.execute<{
    id: string;
    body: string;
    author_user_id: string | null;
  }>(sql`
    select x.id, x.body, x.author_user_id from core.messages x
    where x.tenant_id = ${school.tenantId}::uuid
      and x.thread_id = any(${`{${seeded.join(",")}}`}::uuid[])`);
  for (const row of stored)
    await saveDocument(tx, {
      tenantId: school.tenantId,
      orgId: school.schoolId,
      host: { type: "message", id: row.id },
      content: plainContent(row.body) as unknown as Record<string, unknown>,
      plainText: row.body,
      mediaIds: [],
      userId: row.author_user_id,
      frozen: true,
    });
}

// ---------------------------------------------------------------------------
// Notices, news and events

const part = (heading: string, body: string) => ({
  heading,
  body: plainContent(body),
});

const article = (sections: [string, string][]): ContentDocument =>
  headedContent(sections.map(([heading, body]) => part(heading, body)));

async function notices(
  tx: Tx,
  school: FilledSchool,
  classes: readonly TaughtClass[],
  today: string,
) {
  const everyone: Audience = { scope: "school", classId: null, gradeId: null };
  const families: Audience = {
    scope: "families",
    classId: null,
    gradeId: null,
  };
  const staff: Audience = { scope: "staff", classId: null, gradeId: null };
  const author = {
    tenantId: school.tenantId,
    schoolId: school.schoolId,
    authorId: school.principalId,
  };
  const day = (offset: number) => schoolDay(addDays(today, offset));
  const evening = day(16);
  const secondEvening = schoolDay(addDays(evening, 1));
  const announcements: AnnouncementPlan[] = [
    {
      title: "Welcome to the 2026–2027 school year",
      body: "A warm welcome to all our families, and especially to those joining us for the first time. Registers open at 7:45 each morning and lessons start at 8:00. Timetables, coursework and messages with teachers are all here in the app.",
      audience: everyone,
      urgency: "normal",
      publishAt: at(YEAR.start, "06:00"),
    },
    {
      title: "Parents' evening: book your slots",
      body: `Parents' evening takes place on ${spoken(evening)} and ${spoken(secondEvening)} from 4:00 to 7:30 pm. Each appointment is ten minutes with your child's teachers. Booking closes three days before.`,
      audience: families,
      urgency: "important",
      publishAt: at(addDays(today, -3), "09:00"),
    },
    {
      title: "Grades 4–6: Children's Museum trip permission",
      body: `Grades 4 to 6 will visit the Children's Museum on ${spoken(day(6))} as part of our science unit. Buses leave at 8:30 and return by 1:30. Please acknowledge that your child may join by ${spoken(day(4))}.`,
      audience: families,
      urgency: "important",
      requiresAck: true,
      ackDueOn: day(4),
      publishAt: at(addDays(today, -2), "08:00"),
    },
    {
      title: "Winter uniform from 1 December",
      body: "From 1 December students wear the winter uniform: the navy jumper or school jacket. The uniform shop is open on Sundays and Tuesdays from 8:00 to 10:00.",
      audience: families,
      urgency: "normal",
      publishAt: at(addDays(today, -1), "10:00"),
    },
    {
      title: "Term 1 report deadlines",
      body: `Draft report comments are due by ${spoken(day(20))}; heads of year review them the following week. The comment bank and guidance are in the shared library.`,
      audience: staff,
      urgency: "normal",
      publishAt: at(addDays(today, -5), "13:00"),
    },
    {
      title: "Term 1 reports",
      body: "Term 1 reports will be published here in January. Each report includes grades, attendance and comments from every teacher.",
      audience: families,
      urgency: "normal",
      publishAt: null,
    },
  ];
  await insertAnnouncements(tx, { ...author, on: today }, announcements);
  await seedNotifications(tx, school.tenantId, school.schoolId);

  const news: NewsPlan[] = [
    {
      slug: "october-newsletter",
      title: "October newsletter",
      publishAt: at(addDays(today, -10), "07:00"),
      english: article([
        [
          "From the principal",
          "October has been a busy and joyful month. Our new families have settled in well, and it has been a pleasure to see so many of you at the coffee mornings.",
        ],
        [
          "Book week",
          "Over three hundred books were borrowed during book week, and the KG classes performed a wonderful reading of 'The Very Hungry Caterpillar'.",
        ],
        [
          "Clubs",
          "Chess, robotics, choir and football clubs are now running after school. Places are still available in robotics on Tuesdays.",
        ],
        [
          "Coming up",
          "Parents' evening, the science fair for grades 4 to 6 and the winter concert in December.",
        ],
      ]),
      arabic: article([
        [
          "كلمة المديرة",
          "كان شهر أكتوبر حافلًا ومبهجًا. استقرت الأسر الجديدة جيدًا، وسعدنا بلقاء كثير منكم في لقاءات القهوة الصباحية.",
        ],
        [
          "أسبوع الكتاب",
          "استُعير أكثر من ثلاثمائة كتاب خلال أسبوع الكتاب، وقدّم أطفال الروضة قراءة رائعة لقصة «اليرقة الجائعة جدًا».",
        ],
        [
          "الأندية",
          "بدأت أندية الشطرنج والروبوتات والكورال وكرة القدم بعد اليوم الدراسي، وما زالت هناك أماكن في نادي الروبوتات يوم الثلاثاء.",
        ],
        [
          "قريبًا",
          "لقاء أولياء الأمور، ومعرض العلوم للصفوف من الرابع إلى السادس، والحفل الشتوي في ديسمبر.",
        ],
      ]),
    },
    {
      slug: "u13-football-semi-final",
      title: "Under-13 football team reaches the cup semi-final",
      publishAt: at(addDays(today, -2), "15:30"),
      english: article([
        [
          "A great win",
          "Our under-13 team beat Maadi International 3–1 in the quarter-final, with two goals from Ziad in grade 8.",
        ],
        [
          "Next match",
          `The semi-final is on ${spoken(day(6))}. Families are welcome to come and cheer from the stands.`,
        ],
      ]),
      arabic: null,
    },
    {
      slug: "kg-farm-visit",
      title: "KG2 visits the farm",
      publishAt: at(addDays(today, -6), "12:00"),
      english: article([
        [
          "Learning outdoors",
          "Our KG2 children spent a morning at a farm in Saqqara, feeding the goats, collecting eggs and planting beans to bring back to class.",
        ],
        [
          "Back in class",
          "The beans are now growing on the classroom windowsill, and the children measure them every morning.",
        ],
      ]),
      arabic: null,
    },
    {
      slug: "november-newsletter",
      title: "November newsletter",
      publishAt: null,
      english: article([
        [
          "From the principal",
          "As we reach the middle of the term, thank you for your support at home with reading and homework.",
        ],
      ]),
      arabic: null,
    },
  ];
  await insertNews(tx, { ...author, on: today }, news);

  const grade = (code: string) =>
    classes.find((taught) => taught.homeroomTitle === code)?.homeroomId ?? null;
  const fiveA = grade("5A");
  const events: EventPlan[] = [
    {
      title: "Staff meeting",
      titleAr: "اجتماع المعلمين",
      category: "meeting",
      startsOn: day(2),
      startTime: "14:30",
      endTime: "15:30",
      location: "Library",
      audiences: [staff],
      body: "Parents' evening arrangements and the term 1 report timeline.",
    },
    {
      title: "Children's Museum trip (grades 4–6)",
      titleAr: "رحلة متحف الطفل (الصفوف 4–6)",
      category: "trip",
      startsOn: day(6),
      startTime: "08:30",
      endTime: "13:30",
      location: "Children's Museum, Heliopolis",
      audiences: fiveA
        ? [{ scope: "class", classId: fiveA, gradeId: null }, families]
        : [families],
      body: "Buses leave from the main gate at 8:30. Please send a packed lunch and a water bottle.",
    },
    {
      title: "U13 football: cup semi-final",
      titleAr: "نصف نهائي الكأس لكرة القدم تحت 13 سنة",
      public: true,
      category: "sport",
      startsOn: day(6),
      startTime: "15:00",
      endTime: "16:30",
      provisional: true,
      audiences: [everyone],
      body: "Kick-off time to be confirmed by the league.",
    },
    {
      title: "Science fair (grades 4–6)",
      titleAr: "معرض العلوم (الصفوف 4–6)",
      public: true,
      category: "performance",
      startsOn: day(12),
      startTime: "10:00",
      endTime: "13:00",
      location: "Main hall",
      audiences: [everyone],
      body: "Students present their investigations. Families are welcome from 11:00.",
    },
    {
      title: "Parents' evening",
      titleAr: "لقاء أولياء الأمور",
      category: "meeting",
      startsOn: evening,
      endsOn: secondEvening,
      startTime: "16:00",
      endTime: "19:30",
      location: "Classrooms",
      audiences: [families, staff],
      body: "Ten-minute appointments with each of your child's teachers. Book your slots in the app.",
    },
    {
      title: "Winter concert",
      titleAr: "الحفل الشتوي",
      public: true,
      category: "performance",
      startsOn: day(38),
      startTime: "18:00",
      endTime: "19:30",
      location: "Main hall",
      audiences: [everyone],
      body: "Our choir, band and KG classes perform. Doors open at 5:30 pm.",
    },
    {
      title: "Book week",
      titleAr: "أسبوع الكتاب",
      category: "performance",
      startsOn: day(-26),
      endsOn: day(-22),
      audiences: [everyone],
      body: "A week of stories, author visits and dressing up as a favourite character.",
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
      audiences: [everyone],
      body: "Races, relays and a picnic. Families are welcome to watch.",
    },
  ];
  await insertEvents(tx, author, events);
}

// ---------------------------------------------------------------------------
// Health

/** Conditions a school of four hundred is likely to hold, each for a few children. */
const CONDITIONS: {
  kind: "allergy" | "chronic_condition" | "medication" | "dietary_requirement";
  text: string;
  severity: "mild" | "moderate" | "severe" | "";
  actionPlan: string;
  alert: boolean;
}[] = [
  {
    kind: "allergy",
    text: "Peanuts and tree nuts",
    severity: "severe",
    actionPlan:
      "EpiPen in the clinic and in the class bag. Call parents and an ambulance after use.",
    alert: true,
  },
  {
    kind: "chronic_condition",
    text: "Asthma",
    severity: "moderate",
    actionPlan:
      "Blue inhaler before PE and when wheezy. Inhaler kept in the class.",
    alert: true,
  },
  {
    kind: "dietary_requirement",
    text: "Lactose intolerant",
    severity: "mild",
    actionPlan: "No milk or cheese at snack time.",
    alert: false,
  },
  {
    kind: "chronic_condition",
    text: "Type 1 diabetes",
    severity: "severe",
    actionPlan:
      "Checks blood sugar before lunch. Glucose tablets in the clinic. Call parents if below 4.",
    alert: true,
  },
  {
    kind: "allergy",
    text: "Egg",
    severity: "moderate",
    actionPlan: "Avoid baked goods with egg; antihistamine in the clinic.",
    alert: true,
  },
  {
    kind: "medication",
    text: "Wears glasses for reading",
    severity: "",
    actionPlan: "Sits near the board.",
    alert: false,
  },
];

async function health(tx: Tx, school: FilledSchool) {
  const roll = random(0x4ea1);
  const [key] = await tx
    .select()
    .from(tenantKeys)
    .where(
      and(
        eq(tenantKeys.tenantId, school.tenantId),
        eq(tenantKeys.purpose, "health"),
      ),
    );
  if (!key) throw new Error("tenant has no health key");
  const dek = await school.kek.unwrap(new Uint8Array(key.wrappedDek), {
    cell: school.cell,
    tenantId: school.tenantId,
    purpose: "health",
    keyVersion: key.keyVersion,
  });
  const kinds = await descriptorIds(tx, school.tenantId, "health_record_kind");
  const students = [...school.pupils.values()].flat(2);
  const chosen = students.filter(() => roll() < 0.07);
  await withPurpose(tx, "health", async (inner) => {
    for (const [index, studentId] of chosen.entries()) {
      const condition = CONDITIONS[index % CONDITIONS.length];
      if (!condition) continue;
      const id = Bun.randomUUIDv7();
      const ciphertext = await encryptField(
        dek,
        JSON.stringify({
          text: condition.text,
          ...(condition.severity ? { severity: condition.severity } : {}),
          action_plan: condition.actionPlan,
        }),
        {
          tenantId: school.tenantId,
          table: "health.records",
          column: "ciphertext",
          rowId: id,
          keyVersion: key.keyVersion,
        },
      );
      await inner.insert(healthRecords).values({
        tenantId: school.tenantId,
        id,
        studentUserId: studentId,
        kindDescriptorId: need(kinds, condition.kind),
        hasAlert: condition.alert,
        keyVersion: key.keyVersion,
        ciphertext: Buffer.from(ciphertext),
      });
      if (condition.alert)
        await tx
          .update(users)
          .set({ medicalAlert: true })
          .where(
            and(eq(users.tenantId, school.tenantId), eq(users.id, studentId)),
          );
    }
  });
}

/**
 * The demonstration's lessons, for checking them: every block against what
 * the editor accepts, and the young children's Arabic against what a voice
 * may read aloud.
 */
export function demoLessons(): { young: LessonPlan[]; older: LessonPlan[] } {
  const older = schoolModules();
  return {
    young: [...Object.values(kgModules()), older.lower.arabic].flatMap(
      (module) => module.lessons,
    ),
    older: Object.values(older)
      .flatMap((bySubject) => Object.values(bySubject))
      .filter((module) => module !== older.lower.arabic)
      .flatMap((module) => module.lessons),
  };
}
