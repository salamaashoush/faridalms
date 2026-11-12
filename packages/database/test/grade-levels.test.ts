import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../src/context";

import { openOwner } from "../src/context";
import {
  classesHolding,
  classesOfGrades,
  gradesOfClasses,
  setClassGrade,
  youngClasses,
} from "../src/stores/class-grades";
import {
  gradeAudiencesOf,
  ownersOfClassGrades,
  setGradeAudiences,
} from "../src/stores/grade-audiences";
import {
  classesWithoutChosenProgramme,
  classGrading,
  deriveProgrammes,
  setClassGrading,
} from "../src/stores/grading";
import { gradesOfIntakes, setIntakeGrade } from "../src/stores/intake-grades";
import { setIntakeYear, yearsOfIntakes } from "../src/stores/intake-years";
import { place, placements } from "../src/stores/placements";
import {
  levelsOfProgrammes,
  programmesByLevel,
  setProgrammeLevels,
} from "../src/stores/programme-grades";
import {
  endGrades,
  gradeHistory,
  gradeMeaningsOver,
  gradesOn,
  restoreGrades,
  setStudentGrade,
  studentsHolding,
  youngStudents,
} from "../src/stores/student-grades";
import { harness, urlFor } from "./harness";

class Undone extends Error {}

interface School {
  tenantId: string;
  schoolId: string;
  classId: string;
  studentId: string;
  grade: (meaning: string) => Promise<string>;
}

/** Runs the work as the owner in a seeded school with one of its classes and a student, then undoes it. */
async function inSchool(
  work: (tx: CellTransaction, school: School) => Promise<void>,
) {
  const { a } = harness();
  const owner = openOwner(urlFor(null));
  try {
    await owner.asOwner(a.tenantId, "test", async (tx) => {
      const [row] = await tx.execute<{
        school_id: string;
        class_id: string;
        student_id: string;
      }>(sql`
        select c.org_id as school_id, c.id as class_id, s.user_id as student_id
        from core.classes c
        join core.enrollments s on s.tenant_id = c.tenant_id and s.class_id = c.id
          and s.role = 'student' and s.status = 'active'
        where c.tenant_id = ${a.tenantId}::uuid and c.status = 'active'
        order by c.code limit 1`);
      if (!row) throw new Error("a seeded class with a student");
      const grade = async (meaning: string) => {
        const [found] = await tx.execute<{ id: string }>(sql`
          select id from core.descriptors where tenant_id = ${a.tenantId}::uuid
            and namespace = 'grade_level' and system_meaning = ${meaning} limit 1`);
        if (!found) throw new Error(`grade ${meaning}`);
        return found.id;
      };
      await tx.execute(sql`
        update core.student_grades set status = 'tobedeleted'
        where tenant_id = ${a.tenantId}::uuid and student_user_id = ${row.student_id}::uuid`);
      await work(tx, {
        tenantId: a.tenantId,
        schoolId: row.school_id,
        classId: row.class_id,
        studentId: row.student_id,
        grade,
      });
      throw new Undone();
    });
  } catch (error) {
    if (!(error instanceof Undone)) throw error;
  } finally {
    await owner.close();
  }
}

/** What the database says when it refuses the work, which it undoes; null when it takes it. */
async function refusal(
  tx: CellTransaction,
  work: (tx: CellTransaction) => Promise<unknown>,
): Promise<string | null> {
  try {
    await tx.transaction(async (inner) => {
      await work(inner);
      throw new Undone();
    });
  } catch (error) {
    if (error instanceof Undone) return null;
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  return null;
}

describe("a student's grades", () => {
  test("keep a change set for later when the grade changes from today", async () => {
    await inSchool(async (tx, school) => {
      const org = { tenantId: school.tenantId, orgId: school.schoolId };
      const [one, two, three] = await Promise.all(
        ["grade_1", "grade_2", "grade_3"].map(school.grade),
      );
      if (!one || !two || !three) throw new Error("three grades");
      const set = (gradeId: string, from: string) =>
        setStudentGrade(tx, {
          ...org,
          studentId: school.studentId,
          gradeId,
          from,
          source: "manual",
        });
      expect(await set(one, "2026-09-01")).toBe(true);
      expect(await set(two, "2027-09-01")).toBe(true);
      expect(await set(three, "2026-11-12")).toBe(true);
      const rows = await gradeHistory(tx, {
        ...org,
        studentId: school.studentId,
      });
      expect(rows.map((row) => [row.gradeId, row.from, row.until])).toEqual([
        [one, "2026-09-01", "2026-11-12"],
        [three, "2026-11-12", "2027-09-01"],
        [two, "2027-09-01", null],
      ]);
      expect(
        (
          await gradesOn(tx, {
            ...org,
            on: "2027-01-10",
            studentIds: [school.studentId],
          })
        ).get(school.studentId),
      ).toBe(three);
    });
  });

  test("fill in a grade only where the student holds none that day", async () => {
    await inSchool(async (tx, school) => {
      const org = { tenantId: school.tenantId, orgId: school.schoolId };
      const [one, four] = await Promise.all(
        ["grade_1", "grade_4"].map(school.grade),
      );
      if (!one || !four) throw new Error("two grades");
      const base = {
        ...org,
        studentId: school.studentId,
        from: "2026-09-01",
      };
      await setStudentGrade(tx, { ...base, gradeId: one, source: "manual" });
      expect(
        await setStudentGrade(tx, {
          ...base,
          gradeId: four,
          source: "class",
          onlyIfNone: true,
        }),
      ).toBe(false);
      expect(
        (await gradeHistory(tx, { ...org, studentId: school.studentId })).map(
          (row) => row.gradeId,
        ),
      ).toEqual([one]);
    });
  });

  test("never overlap, which the database refuses by name", async () => {
    await inSchool(async (tx, school) => {
      const one = await school.grade("grade_1");
      const insert = (during: string) =>
        tx.execute(sql`
          insert into core.student_grades (tenant_id, org_id, student_user_id,
            grade_level_descriptor_id, valid_during, source)
          values (${school.tenantId}::uuid, ${school.schoolId}::uuid, ${school.studentId}::uuid,
            ${one}::uuid, ${during}::daterange, 'manual')`);
      await insert("[2026-09-01,)");
      expect(
        await refusal(tx, () => insert("[2026-10-01,2026-11-01)")),
      ).toContain("student_grades_excl");
    });
  });

  test("end on the day a student leaves, and come back when the leaving is undone", async () => {
    await inSchool(async (tx, school) => {
      const org = { tenantId: school.tenantId, orgId: school.schoolId };
      const [one, two] = await Promise.all(
        ["grade_1", "grade_2"].map(school.grade),
      );
      if (!one || !two) throw new Error("two grades");
      const set = (gradeId: string, from: string) =>
        setStudentGrade(tx, {
          ...org,
          studentId: school.studentId,
          gradeId,
          from,
          source: "manual",
        });
      await set(one, "2026-09-01");
      await set(two, "2027-09-01");
      const ended = await endGrades(tx, {
        ...org,
        studentId: school.studentId,
        leftOn: "2027-03-01",
      });
      expect(
        (await gradeHistory(tx, { ...org, studentId: school.studentId })).map(
          (row) => [row.gradeId, row.until],
        ),
      ).toEqual([[one, "2027-03-01"]]);
      await restoreGrades(tx, { tenantId: school.tenantId, ...ended });
      expect(
        (await gradeHistory(tx, { ...org, studentId: school.studentId })).map(
          (row) => [row.gradeId, row.until],
        ),
      ).toEqual([
        [one, "2027-09-01"],
        [two, null],
      ]);
    });
  });

  test("mark a student of a young grade young, and give their grade's meaning over time", async () => {
    await inSchool(async (tx, school) => {
      const org = { tenantId: school.tenantId, orgId: school.schoolId };
      const kg = await school.grade("kg2");
      await setStudentGrade(tx, {
        ...org,
        studentId: school.studentId,
        gradeId: kg,
        from: "2026-09-01",
        source: "manual",
      });
      expect(
        await youngStudents(tx, {
          ...org,
          userIds: [school.studentId],
          on: "2026-10-01",
        }),
      ).toEqual(new Set([school.studentId]));
      expect(
        await gradeMeaningsOver(tx, { ...org, studentId: school.studentId }),
      ).toEqual([{ from: "2026-09-01", before: null, meaning: "kg2" }]);
      expect(
        (await studentsHolding(tx, { ...org, from: "2026-10-01" })).get(kg),
      ).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("a class's grade", () => {
  test("is one at a time, and lists the class among its grade's", async () => {
    await inSchool(async (tx, school) => {
      const org = { tenantId: school.tenantId, orgId: school.schoolId };
      const [one, kg] = await Promise.all(["grade_1", "kg1"].map(school.grade));
      if (!one || !kg) throw new Error("two grades");
      await setClassGrade(tx, {
        ...org,
        classIds: [school.classId],
        gradeId: one,
      });
      await setClassGrade(tx, {
        ...org,
        classIds: [school.classId],
        gradeId: kg,
      });
      expect(
        (await gradesOfClasses(tx, school.tenantId, [school.classId])).get(
          school.classId,
        ),
      ).toBe(kg);
      expect(await classesOfGrades(tx, { ...org, gradeIds: [kg] })).toContain(
        school.classId,
      );
      expect(await youngClasses(tx, school.tenantId, [school.classId])).toEqual(
        new Set([school.classId]),
      );
      expect(
        (await classesHolding(tx, { ...org, from: "2000-01-01" })).get(kg),
      ).toBeGreaterThanOrEqual(1);
      await setClassGrade(tx, {
        ...org,
        classIds: [school.classId],
        gradeId: null,
      });
      expect(
        (await gradesOfClasses(tx, school.tenantId, [school.classId])).size,
      ).toBe(0);
    });
  });

  test("names the announcements and events its grade is an audience of", async () => {
    await inSchool(async (tx, school) => {
      const org = { tenantId: school.tenantId, orgId: school.schoolId };
      const one = await school.grade("grade_1");
      const [broadcast] = await tx.execute<{ id: string }>(sql`
        select id from core.broadcasts where tenant_id = ${school.tenantId}::uuid limit 1`);
      if (!broadcast) throw new Error("a seeded announcement");
      await setClassGrade(tx, {
        ...org,
        classIds: [school.classId],
        gradeId: one,
      });
      await setGradeAudiences(tx, {
        tenantId: school.tenantId,
        kind: "broadcast",
        ownerId: broadcast.id,
        gradeIds: [one, one],
      });
      expect(
        await gradeAudiencesOf(tx, {
          tenantId: school.tenantId,
          kind: "broadcast",
          ownerId: broadcast.id,
        }),
      ).toEqual([one]);
      expect(
        await ownersOfClassGrades(tx, {
          tenantId: school.tenantId,
          kind: "broadcast",
          classIds: [school.classId],
        }),
      ).toContain(broadcast.id);
    });
  });
});

describe("programmes by grade", () => {
  test("keep the programme a class follows by its grade apart from one the school chose", async () => {
    await inSchool(async (tx, school) => {
      const org = { tenantId: school.tenantId, orgId: school.schoolId };
      const one = await school.grade("grade_1");
      const [programme] = await tx.execute<{ id: string }>(sql`
        insert into core.programmes (tenant_id, org_id, title_en)
        values (${school.tenantId}::uuid, ${school.schoolId}::uuid, 'Salama Diploma')
        returning id`);
      if (!programme) throw new Error("a programme");
      await setProgrammeLevels(tx, {
        tenantId: school.tenantId,
        programmeId: programme.id,
        gradeIds: [one],
      });
      expect(
        (
          await levelsOfProgrammes(tx, {
            tenantId: school.tenantId,
            programmeIds: [programme.id],
          })
        ).get(programme.id),
      ).toEqual([one]);
      expect((await programmesByLevel(tx, org)).get(one)).toContain(
        programme.id,
      );
      await setClassGrading(tx, {
        tenantId: school.tenantId,
        classId: school.classId,
        programmeId: null,
        scaleId: null,
      });
      await deriveProgrammes(tx, {
        tenantId: school.tenantId,
        programmes: new Map([[school.classId, programme.id]]),
      });
      const derived = await classGrading(tx, {
        tenantId: school.tenantId,
        classId: school.classId,
        today: "2026-11-12",
      });
      expect(derived?.programmeId).toBeNull();
      expect(derived?.effectiveProgrammeId).toBe(programme.id);
      expect(
        await classesWithoutChosenProgramme(tx, {
          tenantId: school.tenantId,
          classIds: [school.classId],
        }),
      ).toEqual([school.classId]);
      await setClassGrading(tx, {
        tenantId: school.tenantId,
        classId: school.classId,
        programmeId: programme.id,
        scaleId: null,
      });
      await deriveProgrammes(tx, {
        tenantId: school.tenantId,
        programmes: new Map([[school.classId, null]]),
      });
      const chosen = await classGrading(tx, {
        tenantId: school.tenantId,
        classId: school.classId,
        today: "2026-11-12",
      });
      expect(chosen?.programmeId).toBe(programme.id);
      expect(chosen?.effectiveProgrammeId).toBe(programme.id);
    });
  });
});

describe("an intake's year and grade", () => {
  test("are one each, read back with their names", async () => {
    await inSchool(async (tx, school) => {
      const [intake] = await tx.execute<{ id: string; org_id: string }>(sql`
        select id, org_id from core.admission_intakes
        where tenant_id = ${school.tenantId}::uuid and status = 'active' limit 1`);
      const [year] = await tx.execute<{ id: string }>(sql`
        select id from core.academic_sessions where tenant_id = ${school.tenantId}::uuid
          and org_id = ${intake?.org_id ?? school.schoolId}::uuid and type = 'school_year'
          and status = 'active' limit 1`);
      if (!intake || !year) throw new Error("a seeded intake and year");
      const kg = await school.grade("kg1");
      await setIntakeYear(tx, {
        tenantId: school.tenantId,
        orgId: intake.org_id,
        intakeId: intake.id,
        yearId: null,
      });
      await setIntakeYear(tx, {
        tenantId: school.tenantId,
        orgId: intake.org_id,
        intakeId: intake.id,
        yearId: year.id,
      });
      await setIntakeGrade(tx, {
        tenantId: school.tenantId,
        intakeId: intake.id,
        gradeId: kg,
      });
      expect(
        (
          await yearsOfIntakes(tx, {
            tenantId: school.tenantId,
            intakeIds: [intake.id],
          })
        ).get(intake.id)?.yearId,
      ).toBe(year.id);
      expect(
        (
          await gradesOfIntakes(tx, {
            tenantId: school.tenantId,
            intakeIds: [intake.id],
          })
        ).get(intake.id)?.gradeId,
      ).toBe(kg);
      expect(
        await refusal(tx, (inner) =>
          inner.execute(sql`
            insert into core.intake_grades (tenant_id, intake_id, grade_level_descriptor_id)
            values (${school.tenantId}::uuid, ${intake.id}::uuid, ${kg}::uuid)`),
        ),
      ).toContain("intake_grades_intake_key");
    });
  });
});

describe("a placement in a year", () => {
  test("starts earlier rather than overlapping one due later the same year", async () => {
    await inSchool(async (tx, school) => {
      const [year] = await tx.execute<{
        id: string;
        starts_on: string;
        ends_before: string;
      }>(sql`
        select id, lower(span)::text as starts_on, upper(span)::text as ends_before
        from core.academic_sessions where tenant_id = ${school.tenantId}::uuid
          and org_id = ${school.schoolId}::uuid and type = 'school_year' and status = 'active'
        order by lower(span) desc limit 1`);
      if (!year) throw new Error("a seeded year");
      const scope = {
        tenantId: school.tenantId,
        schoolId: school.schoolId,
        today: year.starts_on,
        viewerId: school.studentId,
        schoolWide: true,
      };
      await tx.execute(sql`
        update core.student_school_years set status = 'tobedeleted'
        where tenant_id = ${school.tenantId}::uuid and student_user_id = ${school.studentId}::uuid`);
      const shape = {
        id: year.id,
        startsOn: year.starts_on,
        endsBefore: year.ends_before,
      };
      const later = new Date(`${year.starts_on}T00:00:00Z`);
      later.setUTCDate(later.getUTCDate() + 30);
      const laterDay = later.toISOString().slice(0, 10);
      await place(tx, scope, {
        studentId: school.studentId,
        year: shape,
        from: laterDay,
      });
      await place(tx, scope, {
        studentId: school.studentId,
        year: shape,
        from: year.starts_on,
      });
      const held = (await placements(tx, scope, school.studentId)).filter(
        (row) => row.schoolYearId === year.id,
      );
      expect(held.map((row) => [row.from, row.to])).toEqual([
        [year.starts_on, year.ends_before],
      ]);
    });
  });
});
