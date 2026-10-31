import { createDatabase, schema } from "@faridalms/database";
import { createControlDatabase } from "@faridalms/database/control";
import { schools } from "@faridalms/database/control-schema";
import { addDays, schoolDate } from "@faridalms/domain/school";
import { eq } from "drizzle-orm";

const controlUrl = process.env.CONTROL_DATABASE_URL;
if (
  !controlUrl ||
  !/^\/farida_test_control_[a-z0-9]+$/.test(new URL(controlUrl).pathname)
) {
  throw new Error("Academic year fixtures require an isolated test database");
}
const control = createControlDatabase(controlUrl);
try {
  const [school] = await control
    .select()
    .from(schools)
    .where(eq(schools.slug, "northwind"));
  if (
    !school ||
    !/^\/farida_test_northwind_[a-z0-9]+$/.test(
      new URL(school.databaseUrl).pathname,
    )
  ) {
    throw new Error("Academic year fixtures require an isolated school");
  }
  const db = createDatabase(school.databaseUrl);
  try {
    const today = schoolDate(school.timeZone);
    const result = await db.transaction(async (tx) => {
      const subject = await tx.query.subjects.findFirst();
      if (!subject) throw new Error("Missing subject fixture");
      const [year] = await tx
        .insert(schema.schoolYears)
        .values({
          name: crypto.randomUUID().slice(0, 16),
          startsOn: today,
          endsOn: today,
          isCurrent: false,
        })
        .returning();
      if (!year) throw new Error("Missing academic year fixture");
      const [week] = await tx
        .insert(schema.academicWeeks)
        .values({
          schoolYearId: year.id,
          number: 99,
          startsOn: today,
          endsOn: today,
        })
        .returning();
      const [schoolClass] = await tx
        .insert(schema.classes)
        .values({
          schoolYearId: year.id,
          name: `Salama ${year.name}`,
          grade: "P1",
          stage: "primary",
        })
        .returning();
      if (!week || !schoolClass) throw new Error("Missing class/week fixture");
      await tx.insert(schema.classSubjects).values({
        classId: schoolClass.id,
        subjectId: subject.id,
      });
      let enrollmentFixture;
      if (process.argv.includes("--enrollment")) {
        const formerTeacher = await tx.query.users.findFirst({
          where: { email: "teacher@example.com" },
        });
        if (!formerTeacher) throw new Error("Missing teacher fixture");
        await tx
          .update(schema.classes)
          .set({ homeroomTeacherId: formerTeacher.id })
          .where(eq(schema.classes.id, schoolClass.id));
        const currentYear = await tx.query.schoolYears.findFirst({
          where: { isCurrent: true },
        });
        if (!currentYear) throw new Error("Missing current year fixture");
        const [firstClass, secondClass] = await tx
          .insert(schema.classes)
          .values([
            {
              schoolYearId: currentYear.id,
              name: `A ${year.name}`,
              grade: "P1",
              stage: "primary",
            },
            {
              schoolYearId: currentYear.id,
              name: `B ${year.name}`,
              grade: "P1",
              stage: "primary",
            },
          ])
          .returning();
        const [student] = await tx
          .insert(schema.students)
          .values({
            reference: year.name,
            firstName: "Salama",
            lastName: "Ashoush",
          })
          .returning();
        if (!firstClass || !secondClass || !student)
          throw new Error("Missing enrollment fixtures");
        const [past] = await tx
          .insert(schema.enrolments)
          .values({
            studentId: student.id,
            classId: firstClass.id,
            since: addDays(today, -10),
            until: addDays(today, -5),
          })
          .returning();
        await tx.insert(schema.enrolments).values({
          studentId: student.id,
          classId: schoolClass.id,
          since: today,
        });
        if (!past) throw new Error("Missing past enrollment fixture");
        const [scheduledStudent] = await tx
          .insert(schema.students)
          .values({
            reference: `F${year.name}`,
            firstName: "Salama",
            lastName: "Ashoush",
          })
          .returning();
        if (!scheduledStudent)
          throw new Error("Missing scheduled enrollment fixture");
        await tx.insert(schema.enrolments).values({
          studentId: scheduledStudent.id,
          classId: firstClass.id,
          since: addDays(today, 1),
          until: addDays(today, 5),
        });
        enrollmentFixture = {
          scheduledStudentId: scheduledStudent.id,
          scheduledReference: scheduledStudent.reference,
          studentId: student.id,
          reference: student.reference,
          firstClassId: firstClass.id,
          secondClassId: secondClass.id,
          past,
        };
      }
      return {
        enrollmentFixture,
        schoolYearId: year.id,
        classId: schoolClass.id,
        subjectId: subject.id,
        today,
        weekNumber: week.number,
      };
    });
    console.log(JSON.stringify(result));
  } finally {
    await db.$client.close();
  }
} finally {
  await control.$client.close();
}
