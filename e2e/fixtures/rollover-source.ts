import { createDatabase, schema } from "@faridalms/database";
import { createControlDatabase } from "@faridalms/database/control";
import { schools } from "@faridalms/database/control-schema";
import { addDays, schoolDate } from "@faridalms/domain/school";
import { eq } from "drizzle-orm";

/** A year being taught, ending today, with two classes, their teams and three placed students. */
const controlUrl = process.env.CONTROL_DATABASE_URL;
if (
  !controlUrl ||
  !/^\/northwind_test_control_[a-z0-9]+$/.test(new URL(controlUrl).pathname)
) {
  throw new Error("Rollover fixtures require an isolated test database");
}
const control = createControlDatabase(controlUrl);
try {
  const [school] = await control
    .select()
    .from(schools)
    .where(eq(schools.slug, "northwind"));
  if (
    !school ||
    !/^\/northwind_test_northwind_[a-z0-9]+$/.test(new URL(school.databaseUrl).pathname)
  ) {
    throw new Error("Rollover fixtures require an isolated school");
  }
  const db = createDatabase(school.databaseUrl);
  try {
    const today = schoolDate(school.timeZone);
    const suffix = crypto.randomUUID().slice(0, 6);
    const result = await db.transaction(async (tx) => {
      const [teacher, homeroom] = await Promise.all([
        tx.query.users.findFirst({ where: { email: "sara@example.com" } }),
        tx.query.users.findFirst({ where: { email: "teacher@example.com" } }),
      ]);
      const subjects = await tx.query.subjects.findMany({ limit: 2 });
      const [first, second] = subjects;
      if (!teacher || !homeroom || !first || !second)
        throw new Error("Missing seeded teachers or subjects");
      const [year] = await tx
        .insert(schema.schoolYears)
        .values({
          name: `R${suffix}`,
          startsOn: addDays(today, -60),
          endsOn: today,
          status: "active",
        })
        .returning();
      if (!year) throw new Error("Missing year");
      const [classA, classB] = await tx
        .insert(schema.classes)
        .values([
          {
            schoolYearId: year.id,
            name: `P1-A ${suffix}`,
            grade: "P1",
            stage: "primary",
            homeroomTeacherId: homeroom.id,
          },
          {
            schoolYearId: year.id,
            name: `P1-B ${suffix}`,
            grade: "P1",
            stage: "primary",
          },
        ])
        .returning();
      if (!classA || !classB) throw new Error("Missing classes");
      await tx.insert(schema.classSubjects).values([
        { classId: classA.id, subjectId: first.id, teacherId: teacher.id },
        { classId: classA.id, subjectId: second.id, teacherId: null },
        { classId: classB.id, subjectId: first.id, teacherId: teacher.id },
      ]);
      const students = await tx
        .insert(schema.students)
        .values(
          ["Promoted", "Repeating", "Leaving"].map((role, index) => ({
            reference: `RO-${suffix}-${index}`,
            firstName: "Salama",
            lastName: `${role} ${suffix}`,
          })),
        )
        .returning();
      const [promoted, repeating, leaving] = students;
      if (!promoted || !repeating || !leaving)
        throw new Error("Missing students");
      await tx.insert(schema.enrolments).values([
        {
          studentId: promoted.id,
          classId: classA.id,
          since: addDays(today, -30),
        },
        {
          studentId: repeating.id,
          classId: classA.id,
          since: addDays(today, -30),
        },
        {
          studentId: leaving.id,
          classId: classB.id,
          since: addDays(today, -30),
        },
      ]);
      return {
        yearId: year.id,
        yearName: year.name,
        endsOn: year.endsOn,
        classA: { id: classA.id, name: classA.name },
        classB: { id: classB.id, name: classB.name },
        teacherId: teacher.id,
        homeroomId: homeroom.id,
        subjects: [first.id, second.id],
        students: {
          promoted: { id: promoted.id, name: `Salama ${promoted.lastName}` },
          repeating: { id: repeating.id, name: `Salama ${repeating.lastName}` },
          leaving: { id: leaving.id, name: `Salama ${leaving.lastName}` },
        },
      };
    });
    console.log(JSON.stringify(result));
  } finally {
    await db.$client.close();
  }
} finally {
  await control.$client.close();
}
