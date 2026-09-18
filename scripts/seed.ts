/**
 * Seed the development database.
 *
 * Idempotent: truncates every application table first, so re-running gives the
 * same database rather than a second copy of everything. Never point this at
 * production; it is wired to `bun run db:seed` only.
 */

import type { ContentDocument } from "@faridalms/domain/content";

import { createDatabase, schema } from "@faridalms/database";
import { eq, sql } from "drizzle-orm";

const db = createDatabase(process.env.DATABASE_URL ?? "");
const {
  academicWeeks,
  assessments,
  assignmentRecipients,
  assignments,
  attendance,
  calendarEvents,
  classSubjects,
  classes,
  emergencyContacts,
  enrolments,
  grades,
  guardianships,
  medicalReports,
  messageAttachments,
  messageRecipients,
  messages,
  newsletters,
  schoolYears,
  studentContacts,
  studentMedical,
  students,
  subjects,
  submissionAttempts,
  submissions,
  terms,
  timetableSlots,
  users,
} = schema;

const PASSWORD = "northwind1234";

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_00_00_00_00;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) {
    throw new Error("pick() called with an empty list");
  }
  return value;
}

function paragraph(text: string): ContentDocument {
  return {
    root: {
      type: "root",
      version: 1,
      format: "",
      indent: 0,
      direction: null,
      children: [
        {
          type: "paragraph",
          version: 1,
          format: "",
          indent: 0,
          direction: null,
          textFormat: 0,
          textStyle: "",
          children: [
            {
              type: "text",
              version: 1,
              format: 0,
              detail: 0,
              mode: "normal",
              style: "",
              text,
            },
          ],
        },
      ],
    },
  };
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function reset() {
  // One statement so foreign keys never see a half-empty schema.
  await db.execute(sql`
    truncate table
      ${messageAttachments}, ${messageRecipients}, ${messages},
      ${assessments}, ${submissionAttempts}, ${assignmentRecipients},
      ${submissions}, ${assignments}, ${academicWeeks},
      ${grades}, ${terms}, ${attendance}, ${timetableSlots},
      ${classSubjects}, ${enrolments}, ${guardianships},
      ${medicalReports}, ${studentMedical}, ${emergencyContacts}, ${studentContacts},
      ${students}, ${classes}, ${newsletters}, ${calendarEvents},
      ${subjects}, ${schoolYears}, ${users}
    restart identity cascade
  `);
}

async function main() {
  console.log("Resetting tables…");
  await reset();

  const passwordHash = await Bun.password.hash(PASSWORD, {
    algorithm: "argon2id",
  });

  console.log("School year and terms…");
  const [year] = await db
    .insert(schoolYears)
    .values({
      name: "2026/2027",
      startsOn: "2026-09-01",
      endsOn: "2027-06-30",
      isCurrent: true,
    })
    .returning();
  if (!year) throw new Error("school year insert returned nothing");

  const [previousYear] = await db
    .insert(schoolYears)
    .values({
      name: "2025/2026",
      startsOn: "2025-09-01",
      endsOn: "2026-06-30",
      isCurrent: false,
    })
    .returning();
  if (!previousYear)
    throw new Error("previous school year insert returned nothing");

  const termRows = await db
    .insert(terms)
    .values([
      {
        schoolYearId: year.id,
        name: "Term 1",
        startsOn: "2026-09-01",
        endsOn: "2026-12-19",
      },
      {
        schoolYearId: year.id,
        name: "Term 2",
        startsOn: "2027-01-10",
        endsOn: "2027-03-31",
      },
      {
        schoolYearId: year.id,
        name: "Term 3",
        startsOn: "2027-04-01",
        endsOn: "2027-06-30",
      },
    ])
    .returning();
  const term1 = termRows[0];
  if (!term1) throw new Error("term insert returned nothing");

  console.log("Subjects…");
  const subjectRows = await db
    .insert(subjects)
    .values([
      {
        slug: "human-sciences",
        name: "Human Sciences",
        nameAr: "العلوم الإنسانية",
        icon: "globe",
      },
      {
        slug: "pspe",
        name: "Personal, Social and Physical Education",
        nameAr: "التربية الشخصية والاجتماعية والبدنية",
        icon: "activity",
      },
      {
        slug: "language",
        name: "Language",
        nameAr: "اللغة",
        icon: "book-open",
      },
      {
        slug: "mathematics",
        name: "Mathematics",
        nameAr: "الرياضيات",
        icon: "calculator",
      },
      {
        slug: "sciences",
        name: "Sciences",
        nameAr: "العلوم",
        icon: "flask-conical",
      },
      { slug: "arts", name: "Arts", nameAr: "الفنون", icon: "palette" },
      {
        slug: "arabic",
        name: "Arabic",
        nameAr: "اللغة العربية",
        icon: "languages",
      },
    ])
    .returning();

  const subjectBySlug = new Map(subjectRows.map((row) => [row.slug, row]));
  const subjectId = (slug: string) => {
    const row = subjectBySlug.get(slug);
    if (!row) throw new Error(`unknown subject ${slug}`);
    return row.id;
  };

  console.log("Users…");
  const userRows = await db
    .insert(users)
    .values([
      {
        email: "admin@example.com",
        passwordHash,
        name: "Layla Fahmy",
        role: "admin",
        title: "Head of School Operations",
      },
      {
        email: "teacher@example.com",
        passwordHash,
        name: "Norhan Elsaraf",
        role: "teacher",
        title: "PreKG Homeroom",
      },
      {
        email: "sara@example.com",
        passwordHash,
        name: "Sara Mahmoud",
        role: "teacher",
        title: "P1 Homeroom",
      },
      {
        email: "parent@example.com",
        passwordHash,
        name: "Salama Ashoush",
        role: "parent",
      },
      {
        email: "omar@example.com",
        passwordHash,
        name: "Omar Ashoush",
        role: "student",
        title: "P1-B",
      },
    ])
    .returning();

  const userByEmail = new Map(userRows.map((row) => [row.email, row]));
  const userId = (email: string) => {
    const row = userByEmail.get(email);
    if (!row) throw new Error(`unknown user ${email}`);
    return row.id;
  };

  console.log("Classes…");
  const classRows = await db
    .insert(classes)
    .values([
      {
        schoolYearId: year.id,
        name: "PreKG-A",
        grade: "PreKG",
        stage: "early_years",
        room: "Room 3",
        homeroomTeacherId: userId("teacher@example.com"),
      },
      {
        schoolYearId: year.id,
        name: "P1-B",
        grade: "P1",
        stage: "primary",
        room: "Room 11",
        homeroomTeacherId: userId("sara@example.com"),
      },
    ])
    .returning();

  const classByName = new Map(classRows.map((row) => [row.name, row]));
  const prekg = classByName.get("PreKG-A");
  const p1 = classByName.get("P1-B");
  if (!prekg || !p1) throw new Error("class insert returned nothing");

  const PREKG_SUBJECTS = ["human-sciences", "pspe", "arts", "language"];
  const P1_SUBJECTS = [
    "language",
    "mathematics",
    "sciences",
    "human-sciences",
    "arabic",
    "arts",
  ];

  await db.insert(classSubjects).values([
    ...PREKG_SUBJECTS.map((slug) => ({
      classId: prekg.id,
      subjectId: subjectId(slug),
      teacherId: userId("teacher@example.com"),
    })),
    ...P1_SUBJECTS.map((slug) => ({
      classId: p1.id,
      subjectId: subjectId(slug),
      teacherId: userId("sara@example.com"),
    })),
  ]);

  console.log("Students…");
  const studentRows = await db
    .insert(students)
    .values([
      {
        reference: "GIC-2026-0001",
        firstName: "Ali",
        lastName: "Ashoush",
        birthdate: "2023-04-18",
      },
      {
        reference: "GIC-2026-0002",
        firstName: "Omar",
        lastName: "Ashoush",
        birthdate: "2019-11-02",
        userId: userId("omar@example.com"),
      },
    ])
    .returning();

  const studentByRef = new Map(studentRows.map((row) => [row.reference, row]));
  const ali = studentByRef.get("GIC-2026-0001");
  const omar = studentByRef.get("GIC-2026-0002");
  if (!ali || !omar) throw new Error("student insert returned nothing");

  await db.insert(studentContacts).values([
    {
      studentId: ali.id,
      email: "parent@example.com",
      fatherMobile: "+20 100 000 0001",
      motherMobile: "+20 100 000 0002",
      contactMobile: "+20 100 000 0001",
      fatherAddress: "12 Nile View, Maadi, Cairo",
      motherAddress: "12 Nile View, Maadi, Cairo",
    },
    {
      studentId: omar.id,
      email: "parent@example.com",
      fatherMobile: "+20 100 000 0001",
      motherMobile: "+20 100 000 0002",
      contactMobile: "+20 100 000 0002",
      fatherAddress: "12 Nile View, Maadi, Cairo",
      motherAddress: "12 Nile View, Maadi, Cairo",
    },
  ]);

  await db.insert(emergencyContacts).values([
    {
      studentId: ali.id,
      name: "Mona Ashoush",
      mobile: "+20 100 000 0003",
      relation: "Aunt",
      priority: 1,
    },
    {
      studentId: ali.id,
      name: "Hassan Ashoush",
      mobile: "+20 100 000 0004",
      relation: "Grandfather",
      priority: 2,
    },
    {
      studentId: omar.id,
      name: "Mona Ashoush",
      mobile: "+20 100 000 0003",
      relation: "Aunt",
      priority: 1,
    },
  ]);

  await db.insert(studentMedical).values([
    {
      studentId: ali.id,
      bloodGroup: "O+",
      allergies: "Peanuts",
      medicineAgreement: true,
    },
    {
      studentId: omar.id,
      bloodGroup: "A+",
      pastInjuries: "Fractured left wrist, 2025",
      medicineAgreement: true,
    },
  ]);

  await db.insert(medicalReports).values([
    {
      studentId: ali.id,
      name: "Vaccination record.pdf",
      url: "/uploads/ali-vaccination.pdf",
      uploadedOn: "2026-08-28",
    },
  ]);

  await db.insert(guardianships).values([
    {
      guardianId: userId("parent@example.com"),
      studentId: ali.id,
      relation: "father",
      isPrimary: true,
    },
    {
      guardianId: userId("parent@example.com"),
      studentId: omar.id,
      relation: "father",
      isPrimary: true,
    },
  ]);

  await db.insert(enrolments).values([
    { studentId: ali.id, classId: prekg.id, since: "2026-09-09" },
    { studentId: omar.id, classId: p1.id, since: "2026-09-10" },
  ]);

  console.log("Academic weeks…");
  const WEEK_ONE_START = "2026-09-06";
  const TERM_WEEKS = 14;
  const weekRows = await db
    .insert(academicWeeks)
    .values(
      Array.from({ length: TERM_WEEKS }, (_, index) => {
        const startsOn = addDays(WEEK_ONE_START, index * 7);
        return {
          schoolYearId: year.id,
          number: index + 1,
          startsOn,
          endsOn: addDays(startsOn, 4),
        };
      }),
    )
    .returning();
  const weekByNumber = new Map(weekRows.map((row) => [row.number, row]));

  console.log("Timetable…");
  const DAY_START_TIMES = [
    "08:00",
    "08:50",
    "09:40",
    "10:50",
    "11:40",
    "12:30",
  ];
  const timetableValues: (typeof timetableSlots.$inferInsert)[] = [];
  for (const [group, slugs, teacherEmail] of [
    [prekg, PREKG_SUBJECTS, "teacher@example.com"],
    [p1, P1_SUBJECTS, "sara@example.com"],
  ] as const) {
    for (let weekday = 0; weekday <= 4; weekday += 1) {
      DAY_START_TIMES.forEach((startTime, index) => {
        const slug = slugs[(weekday + index) % slugs.length];
        if (!slug) return;
        const [hourPart = "08", minutePart = "00"] = startTime.split(":");
        const endMinutes = Number(hourPart) * 60 + Number(minutePart) + 45;
        const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
        timetableValues.push({
          classId: group.id,
          subjectId: subjectId(slug),
          teacherId: userId(teacherEmail),
          weekday,
          startTime: `${startTime}:00`,
          endTime: `${endTime}:00`,
          room: group.room,
        });
      });
    }
  }
  await db.insert(timetableSlots).values(timetableValues);

  console.log("Assignments and submissions…");
  const random = rng(20_262_027);
  const ASSIGNMENT_TITLES: Record<string, string[]> = {
    "human-sciences": [
      "Our neighbourhood helpers",
      "Maps of home",
      "Seasons around us",
    ],
    pspe: ["Balance and movement", "Healthy plates", "Playground cooperation"],
    language: ["Letter sounds practice", "Story retelling", "Rhyming pairs"],
    mathematics: ["Counting to twenty", "Shapes hunt", "Simple patterns"],
    sciences: ["Floating and sinking", "Plant parts", "Weather diary"],
    arts: ["Colour mixing", "Clay animals", "Collage of autumn"],
    arabic: ["حروف الهجاء", "قراءة الكلمات", "الأرقام العربية"],
  };
  const TYPES = [
    "written_assignment",
    "project",
    "reading",
    "quiz",
    "presentation",
  ] as const;

  const assignmentValues: (typeof assignments.$inferInsert)[] = [];
  for (const [group, slugs, teacherEmail, perWeek] of [
    [prekg, PREKG_SUBJECTS, "teacher@example.com", 2],
    [p1, P1_SUBJECTS, "sara@example.com", 3],
  ] as const) {
    for (let week = 1; week <= TERM_WEEKS; week += 1) {
      const weekRow = weekByNumber.get(week);
      if (!weekRow) continue;
      for (let n = 0; n < perWeek; n += 1) {
        const slug = slugs[(week + n) % slugs.length];
        if (!slug) continue;
        const titles = ASSIGNMENT_TITLES[slug] ?? ["Assignment"];
        const title = titles[(week + n) % titles.length] ?? "Assignment";
        const description = `${title}. Please complete with your child and return by the due date.`;
        const dueDate = addDays(weekRow.startsOn, 2 + (n % 3));
        assignmentValues.push({
          classId: group.id,
          subjectId: subjectId(slug),
          weekId: weekRow.id,
          authorId: userId(teacherEmail),
          title,
          description,
          instructions: paragraph(description),
          type: pick(random, TYPES),
          status: "published",
          assignedOn: weekRow.startsOn,
          dueDate,
          // 23:59 in Cairo, the only seeded school time zone.
          dueAt: new Date(`${dueDate}T20:59:00Z`),
          latePolicy: "accepted",
          resubmission: "until_close",
          maxScore: 10,
          publishedAt: new Date(`${weekRow.startsOn}T07:00:00Z`),
        });
      }
    }
  }
  const assignmentRows = await db
    .insert(assignments)
    .values(assignmentValues)
    .returning();

  const rosterByClass = new Map([
    [prekg.id, [ali.id]],
    [p1.id, [omar.id]],
  ]);

  await db.insert(assignmentRecipients).values(
    assignmentRows.flatMap((assignment) =>
      (rosterByClass.get(assignment.classId) ?? []).map((studentId) => ({
        assignmentId: assignment.id,
        studentId,
        source: "class",
      })),
    ),
  );

  const submissionValues: (typeof submissions.$inferInsert)[] = [];
  for (const assignment of assignmentRows) {
    const roster = rosterByClass.get(assignment.classId) ?? [];
    // Weeks 1 and 2 are behind the seeded "today", so they carry outcomes.
    const isPast = assignment.dueDate < "2026-09-14";
    for (const student of roster) {
      // Some past work stays "submitted" so the teacher's grading queue has
      // something in it. A seed where everything is already returned makes the
      // whole grading screen unreachable.
      const state = isPast
        ? pick(random, ["returned", "submitted", "submitted"] as const)
        : "not_started";
      const score = state === "returned" ? 6 + Math.floor(random() * 5) : null;
      submissionValues.push({
        assignmentId: assignment.id,
        studentId: student,
        state,
        revision: state === "not_started" ? 1 : 2,
        content:
          state === "not_started"
            ? null
            : "We worked through this together at home.",
        submittedAt:
          state === "not_started"
            ? null
            : new Date(`${assignment.dueDate}T12:00:00Z`),
        score,
        feedback: state === "returned" ? "Well done, keep it up." : null,
        gradedById: state === "returned" ? assignment.authorId : null,
        gradedAt:
          state === "returned"
            ? new Date(`${assignment.dueDate}T16:00:00Z`)
            : null,
      });
    }
  }
  const submissionRows = await db
    .insert(submissions)
    .values(submissionValues)
    .returning();
  const studentAccount = new Map([[omar.id, userId("omar@example.com")]]);
  for (const submission of submissionRows) {
    if (submission.state === "not_started" || !submission.submittedAt) continue;
    const [attempt] = await db
      .insert(submissionAttempts)
      .values({
        submissionId: submission.id,
        number: 1,
        sourceRevision: 1,
        content: paragraph(submission.content ?? ""),
        plainText: submission.content,
        submittedAt: submission.submittedAt,
        submittedById: studentAccount.get(submission.studentId) ?? null,
      })
      .returning();
    if (!attempt) throw new Error("attempt insert returned nothing");
    await db
      .update(submissions)
      .set({ currentAttemptId: attempt.id })
      .where(eq(submissions.id, submission.id));
    if (submission.state === "returned" && submission.score !== null) {
      await db.insert(assessments).values({
        attemptId: attempt.id,
        score: submission.score,
        effectiveScore: submission.score,
        feedback: paragraph(submission.feedback ?? ""),
        feedbackText: submission.feedback,
        gradedById: submission.gradedById,
        gradedAt: submission.gradedAt ?? submission.submittedAt,
        releasedAt: submission.gradedAt ?? submission.submittedAt,
      });
    }
  }

  console.log("Attendance…");
  const attendanceRandom = rng(98_765);
  const attendanceValues: (typeof attendance.$inferInsert)[] = [];
  for (const [student, group] of [
    [ali, prekg],
    [omar, p1],
  ] as const) {
    for (let day = 0; day < 60; day += 1) {
      const date = addDays(WEEK_ONE_START, day);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      // The school week runs Sunday to Thursday.
      if (weekday === 5 || weekday === 6) continue;
      if (date > "2026-09-14") continue;
      const roll = attendanceRandom();
      const status =
        roll > 0.94
          ? "absent"
          : roll > 0.89
            ? "late"
            : roll > 0.87
              ? "excused"
              : "present";
      attendanceValues.push({
        studentId: student.id,
        classId: group.id,
        date,
        status,
        note: status === "excused" ? "Medical appointment" : null,
        recordedById: group.homeroomTeacherId,
      });
    }
  }
  await db.insert(attendance).values(attendanceValues);

  console.log("Grades…");
  const gradeRandom = rng(4_242);
  const gradeValues: (typeof grades.$inferInsert)[] = [];
  for (const [student, slugs, teacherEmail] of [
    [ali, PREKG_SUBJECTS, "teacher@example.com"],
    [omar, P1_SUBJECTS, "sara@example.com"],
  ] as const) {
    for (const slug of slugs) {
      gradeValues.push({
        studentId: student.id,
        subjectId: subjectId(slug),
        termId: term1.id,
        score: 68 + Math.floor(gradeRandom() * 30),
        maxScore: 100,
        comment: gradeRandom() > 0.5 ? "Steady progress this term." : null,
        teacherId: userId(teacherEmail),
      });
    }
  }
  await db.insert(grades).values(gradeValues);

  console.log("Messages…");
  const adminId = userId("admin@example.com");
  const parentId = userId("parent@example.com");
  const norhanId = userId("teacher@example.com");
  const saraId = userId("sara@example.com");

  const messageRows = await db
    .insert(messages)
    .values([
      {
        senderId: adminId,
        category: "administration",
        studentId: ali.id,
        subject: "Uniform store: extended opening hours",
        body: "Dear parents, the uniform store will stay open until 4pm every Tuesday and Thursday for the first three weeks of term. No appointment is needed.",
        sentAt: new Date("2026-09-07T11:50:00Z"),
      },
      {
        senderId: adminId,
        category: "administration",
        studentId: ali.id,
        subject: "School uniform: available sizes",
        body: "Dear parents, the full size range is now in stock for PreKG and KG1. Please check the attached chart before visiting the store.",
        sentAt: new Date("2026-09-04T11:39:00Z"),
      },
      {
        senderId: saraId,
        category: "teachers",
        studentId: omar.id,
        subject: "Reading corner volunteers",
        body: "We are looking for parents who can read with small groups on Wednesday mornings. Thirty minutes, once a fortnight. Please reply if you can join.",
        sentAt: new Date("2026-09-09T08:15:00Z"),
      },
      {
        senderId: parentId,
        category: "teachers",
        studentId: ali.id,
        subject: "Absence on 22 September",
        body: "Ali has a paediatric appointment on the morning of 22 September and will arrive after the first break.",
        sentAt: new Date("2026-09-10T07:40:00Z"),
      },
    ])
    .returning();

  const [uniformHours, uniformSizes, readingCorner, absence] = messageRows;
  if (!uniformHours || !uniformSizes || !readingCorner || !absence) {
    throw new Error("message insert returned nothing");
  }

  await db.insert(messageRecipients).values([
    { messageId: uniformHours.id, recipientId: parentId },
    { messageId: uniformSizes.id, recipientId: parentId },
    {
      messageId: readingCorner.id,
      recipientId: parentId,
      readAt: new Date("2026-09-09T18:00:00Z"),
    },
    { messageId: absence.id, recipientId: norhanId },
  ]);

  await db.insert(messageAttachments).values([
    {
      messageId: uniformHours.id,
      name: "uniform-price-list.pdf",
      url: "/uploads/uniform-price-list.pdf",
      sizeBytes: 184_320,
    },
    {
      messageId: uniformSizes.id,
      name: "size-chart.pdf",
      url: "/uploads/size-chart.pdf",
      sizeBytes: 96_140,
    },
  ]);

  // A reply in the same thread, so the detail view has one to render.
  const [reply] = await db
    .insert(messages)
    .values({
      senderId: parentId,
      category: "teachers",
      studentId: omar.id,
      parentMessageId: readingCorner.id,
      subject: "Re: Reading corner volunteers",
      body: "Happy to help on alternate Wednesdays. Please put me down from next week.",
      sentAt: new Date("2026-09-09T19:02:00Z"),
    })
    .returning();
  if (reply) {
    await db
      .insert(messageRecipients)
      .values({ messageId: reply.id, recipientId: saraId });
  }

  console.log("Newsletters…");
  const newsletterDates = [
    "2026-06-18",
    "2026-06-04",
    "2026-05-22",
    "2026-05-11",
    "2026-05-03",
    "2026-03-24",
    "2026-03-15",
    "2026-03-05",
    "2026-03-02",
    "2026-02-24",
    "2026-02-09",
    "2026-01-25",
    "2026-01-15",
    "2025-12-11",
    "2025-12-07",
    "2025-11-28",
    "2025-11-23",
    "2025-11-15",
    "2025-11-06",
    "2025-10-23",
  ];
  await db.insert(newsletters).values(
    newsletterDates.map((publishedOn, index) => {
      const week = newsletterDates.length - index;
      return {
        schoolYearId: previousYear.id,
        title: `Week ${week} newsletter`,
        summary:
          "Highlights from across the school, upcoming dates and reminders for families.",
        url: `/newsletters/week-${week}.pdf`,
        publishedOn,
      };
    }),
  );

  console.log("Calendar…");
  await db.insert(calendarEvents).values(
    (
      [
        ["Arrival of teachers", "general", "2026-08-19", "2026-08-19", false],
        [
          "Orientation for new parents",
          "general",
          "2026-09-03",
          "2026-09-03",
          false,
        ],
        [
          "Parents meeting for Pre-KG, KG1 and KG2",
          "general",
          "2026-09-07",
          "2026-09-07",
          false,
        ],
        [
          "Parents meeting for PYP",
          "general",
          "2026-09-08",
          "2026-09-08",
          false,
        ],
        [
          "First day of school for Pre-KG, KG1 and KG2",
          "general",
          "2026-09-09",
          "2026-09-09",
          false,
        ],
        [
          "First day of school for PYP",
          "general",
          "2026-09-10",
          "2026-09-10",
          false,
        ],
        [
          "Children's International Day",
          "general",
          "2026-11-20",
          "2026-11-20",
          false,
        ],
        [
          "Planning day for teachers",
          "general",
          "2026-11-29",
          "2026-11-29",
          false,
        ],
        [
          "Arabic International Day",
          "general",
          "2026-12-17",
          "2026-12-17",
          false,
        ],
        ["Ministry exams", "general", "2027-01-11", "2027-01-17", false],
        [
          "Ramadan timetable begins",
          "general",
          "2027-02-08",
          "2027-02-08",
          true,
        ],
        [
          "Mother's Day celebration",
          "general",
          "2027-03-21",
          "2027-03-21",
          false,
        ],
        [
          "Planning day for teachers",
          "general",
          "2027-04-15",
          "2027-04-15",
          false,
        ],
        [
          "Earth International Day",
          "general",
          "2027-04-22",
          "2027-04-22",
          false,
        ],
        ["Government exams", "general", "2027-05-23", "2027-05-27", true],
        ["Last day for students", "general", "2027-06-17", "2027-06-17", false],
        ["Last day for teachers", "general", "2027-06-23", "2027-06-23", false],

        [
          "Birth of the Prophet",
          "national_vacation",
          "2026-08-26",
          "2026-08-26",
          true,
        ],
        [
          "October 6 holiday",
          "national_vacation",
          "2026-10-06",
          "2026-10-06",
          true,
        ],
        [
          "Police Day / Revolution Day",
          "national_vacation",
          "2027-01-25",
          "2027-01-25",
          true,
        ],
        ["Eid al-Fitr", "national_vacation", "2027-03-20", "2027-03-23", true],
        [
          "Sinai Liberation Day",
          "national_vacation",
          "2027-04-25",
          "2027-04-25",
          false,
        ],
        ["Labour Day", "national_vacation", "2027-05-01", "2027-05-01", false],
        [
          "Sham El Nessim",
          "national_vacation",
          "2027-05-03",
          "2027-05-06",
          true,
        ],
        [
          "Eid al-Adha holiday",
          "national_vacation",
          "2027-05-16",
          "2027-05-19",
          true,
        ],

        [
          "October holidays",
          "school_vacation",
          "2026-10-25",
          "2026-10-31",
          false,
        ],
        [
          "Christmas holidays",
          "school_vacation",
          "2026-12-20",
          "2027-01-09",
          false,
        ],
        ["Epiphany", "school_vacation", "2027-01-19", "2027-01-19", true],
        [
          "Winter vacation",
          "school_vacation",
          "2027-03-07",
          "2027-03-13",
          false,
        ],
        [
          "Coptic Easter Day",
          "school_vacation",
          "2027-05-02",
          "2027-05-02",
          true,
        ],
      ] as const
    ).map(([title, category, startsOn, endsOn, provisional]) => ({
      schoolYearId: year.id,
      title,
      category,
      startsOn,
      endsOn,
      provisional,
    })),
  );

  console.log("\nSeeded. Sign in with any of:");
  for (const row of userRows) {
    console.log(
      `  ${row.email.padEnd(24)} ${row.role.padEnd(8)} password: ${PASSWORD}`,
    );
  }
}

await main();
process.exit(0);
