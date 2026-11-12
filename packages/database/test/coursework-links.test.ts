import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../src/context";

import { openOwner } from "../src/context";
import { insertAssignment } from "../src/stores/coursework";
import { classGrading, setClassGrading } from "../src/stores/grading";
import {
  insertLesson,
  insertModule,
  lessonSoundsOf,
  setLessonSounds,
} from "../src/stores/learning";
import { lessonSitting } from "../src/stores/lesson-sittings";
import {
  discussionParts,
  placeDiscussion,
  placementsOf,
} from "../src/stores/module-discussions";
import { recordEvidence } from "../src/stores/standards";
import {
  releasePeriodGrades,
  savePeriodGrade,
  setTermOfWork,
  studentPeriodGrades,
  termsOfWork,
} from "../src/stores/term-grades";
import { workSitting } from "../src/stores/work-sittings";
import { harness, urlFor } from "./harness";

class Undone extends Error {}

interface School {
  tenantId: string;
  schoolId: string;
  classId: string;
  otherClassId: string;
  teacherId: string;
  studentId: string;
}

/** Runs the work as the owner in the group's first school, with two of its classes and a student of the first, then undoes it. */
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
        other_class_id: string;
        teacher_id: string;
        student_id: string;
      }>(sql`
        select c.org_id as school_id, c.id as class_id, o.id as other_class_id,
          t.user_id as teacher_id, s.user_id as student_id
        from core.classes c
        join core.classes o on o.tenant_id = c.tenant_id and o.org_id = c.org_id
          and o.id <> c.id and o.status = 'active'
        join core.enrollments t on t.tenant_id = c.tenant_id and t.class_id = c.id
          and t.role = 'teacher' and t.status = 'active'
        join core.enrollments s on s.tenant_id = c.tenant_id and s.class_id = c.id
          and s.role = 'student' and s.status = 'active'
        where c.tenant_id = ${a.tenantId}::uuid and c.status = 'active'
        order by c.code, o.code limit 1`);
      if (!row) throw new Error("a seeded class with a teacher and a student");
      await work(tx, {
        tenantId: a.tenantId,
        schoolId: row.school_id,
        classId: row.class_id,
        otherClassId: row.other_class_id,
        teacherId: row.teacher_id,
        studentId: row.student_id,
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

const FIELDS = {
  audience: "class" as const,
  availableFrom: null,
  dueAt: null,
  closesAt: null,
  latePolicy: "accept" as const,
  lateDeductionPercent: null,
  maxFiles: 5,
  resubmission: false,
  points: 10,
  rubric: null,
  categoryId: null,
  quizAttempts: null,
  quizKeep: null,
  quizReveal: null,
  quizShuffle: false,
  quizTimeLimit: null,
  quizPractice: false,
  quizBands: [],
  gradeAfterAnswers: false,
  peerReviews: null,
  peerAnonymous: null,
  peerDueAt: null,
  language: null,
  translationTitle: null,
};

async function discussionIn(tx: CellTransaction, school: School) {
  return insertAssignment(tx, {
    ...FIELDS,
    tenantId: school.tenantId,
    orgId: school.schoolId,
    classRow: { id: school.classId },
    authorUserId: school.teacherId,
    title: "Which river would you visit?",
    submissionFormat: "discussion",
    discussionPostFirst: false,
    discussionReplies: 0,
  });
}

async function moduleIn(tx: CellTransaction, school: School) {
  return insertModule(tx, {
    tenantId: school.tenantId,
    schoolId: school.schoolId,
    authorId: school.teacherId,
    title: "Rivers",
    summary: "",
    sequential: false,
    prerequisiteId: null,
    prerequisiteScore: null,
    practiceBands: [],
  });
}

describe("work and modules with no year", () => {
  test("an assignment and a module are kept without a school year", async () => {
    await inSchool(async (tx, school) => {
      const work = await discussionIn(tx, school);
      const module = await moduleIn(tx, school);
      const [row] = await tx.execute<{
        assignment: string;
        module: string;
      }>(sql`
        select a.id as assignment, m.id as module from core.assignments a, core.learning_modules m
        where a.tenant_id = ${school.tenantId}::uuid and a.id = ${work.id}::uuid
          and m.tenant_id = a.tenant_id and m.id = ${module.id}::uuid`);
      expect(row).toEqual({ assignment: work.id, module: module.id });
    });
  });
});

describe("a discussion's place in a module", () => {
  test("follows its assignment's class and status, comes back with it, and never refuses a change to the work", async () => {
    await inSchool(async (tx, school) => {
      const work = await discussionIn(tx, school);
      const module = await moduleIn(tx, school);
      await placeDiscussion(tx, {
        tenantId: school.tenantId,
        assignmentId: work.id,
        classId: school.classId,
        moduleId: module.id,
        group: work.id,
      });
      const link = async () => {
        const [row] = await tx.execute<{
          class_id: string;
          status: string;
        }>(sql`
          select class_id, status from core.module_discussions
          where tenant_id = ${school.tenantId}::uuid and assignment_id = ${work.id}::uuid`);
        return row;
      };
      await tx.execute(sql`
        update core.assignments set class_id = ${school.otherClassId}::uuid
        where tenant_id = ${school.tenantId}::uuid and id = ${work.id}::uuid`);
      expect(await link()).toEqual({
        class_id: school.otherClassId,
        status: "active",
      });
      await tx.execute(sql`
        update core.assignments set status = 'tobedeleted'
        where tenant_id = ${school.tenantId}::uuid and id = ${work.id}::uuid`);
      expect((await link())?.status).toBe("tobedeleted");
      expect(
        await discussionParts(tx, {
          tenantId: school.tenantId,
          group: work.id,
        }),
      ).toEqual([]);
      await tx.execute(sql`
        update core.assignments set status = 'active'
        where tenant_id = ${school.tenantId}::uuid and id = ${work.id}::uuid`);
      expect((await link())?.status).toBe("active");
      expect(
        (
          await discussionParts(tx, {
            tenantId: school.tenantId,
            group: work.id,
          })
        ).map((row) => row.id),
      ).toEqual([work.id]);
      // A change of format made while e-learning is off is taken; the
      // placement then reads as none.
      expect(
        await refusal(tx, (inner) =>
          inner.execute(sql`
            update core.assignments set submission_format = 'online',
              discussion_post_first = null, discussion_replies = null
            where tenant_id = ${school.tenantId}::uuid and id = ${work.id}::uuid`),
        ),
      ).toBeNull();
      await tx.execute(sql`
        update core.assignments set submission_format = 'online',
          discussion_post_first = null, discussion_replies = null
        where tenant_id = ${school.tenantId}::uuid and id = ${work.id}::uuid`);
      expect(
        (
          await placementsOf(tx, {
            tenantId: school.tenantId,
            assignmentIds: [work.id],
          })
        ).size,
      ).toBe(0);
    });
  });

  test("a module discussion has one part a class", async () => {
    await inSchool(async (tx, school) => {
      const module = await moduleIn(tx, school);
      const lead = await discussionIn(tx, school);
      const second = await discussionIn(tx, school);
      await placeDiscussion(tx, {
        tenantId: school.tenantId,
        assignmentId: lead.id,
        classId: school.classId,
        moduleId: module.id,
        group: lead.id,
      });
      expect(
        await refusal(tx, (inner) =>
          placeDiscussion(inner, {
            tenantId: school.tenantId,
            assignmentId: second.id,
            classId: school.classId,
            moduleId: module.id,
            group: lead.id,
          }),
        ),
      ).toContain("module_discussions_class_key");
    });
  });
});

describe("a class's grading", () => {
  test("a class's programme and scale are kept beside it, and read as its scale", async () => {
    await inSchool(async (tx, school) => {
      const [scale] = await tx.execute<{ id: string }>(sql`
        insert into core.grade_scales (tenant_id, org_id, title_en, display)
        values (${school.tenantId}::uuid, ${school.schoolId}::uuid, 'Letters', 'grade')
        returning id`);
      if (!scale) throw new Error("scale not written");
      await tx.execute(sql`
        insert into core.grade_scale_versions (tenant_id, scale_id, effective_from, bands, created_by_user_id)
        values (${school.tenantId}::uuid, ${scale.id}::uuid, '2020-01-01',
          '[{"labelEn":"A","labelAr":"A","minPercent":50,"gpa":null},{"labelEn":"F","labelAr":"F","minPercent":0,"gpa":null}]'::jsonb, ${school.teacherId}::uuid)`);
      const scope = {
        tenantId: school.tenantId,
        classId: school.classId,
        today: "2026-11-12",
      };
      await setClassGrading(tx, {
        ...scope,
        programmeId: null,
        scaleId: scale.id,
      });
      expect(await classGrading(tx, scope)).toMatchObject({
        scaleId: scale.id,
        programmeId: null,
      });
      expect((await classGrading(tx, scope))?.versionId).toBeTruthy();
      await setClassGrading(tx, { ...scope, programmeId: null, scaleId: null });
      expect(await classGrading(tx, scope)).toMatchObject({
        scaleId: null,
        programmeId: null,
      });
      expect(
        await refusal(tx, (inner) =>
          inner.execute(sql`
            insert into core.class_grading (tenant_id, org_id, class_id)
            values (${school.tenantId}::uuid, ${school.schoolId}::uuid, ${school.classId}::uuid)`),
        ),
      ).toContain("class_grading_chosen_check");
    });
  });

  test("a class's lesson sounds are e-learning's, on until a teacher turns them off", async () => {
    await inSchool(async (tx, school) => {
      expect(await lessonSoundsOf(tx, school.tenantId, school.classId)).toBe(
        true,
      );
      await setLessonSounds(tx, {
        tenantId: school.tenantId,
        classId: school.classId,
        on: false,
      });
      expect(await lessonSoundsOf(tx, school.tenantId, school.classId)).toBe(
        false,
      );
      await setLessonSounds(tx, {
        tenantId: school.tenantId,
        classId: school.classId,
        on: true,
      });
      expect(await lessonSoundsOf(tx, school.tenantId, school.classId)).toBe(
        true,
      );
    });
  });
});

describe("terms", () => {
  test("work counts toward one term, and term grades read their year through the term", async () => {
    await inSchool(async (tx, school) => {
      const [term] = await tx.execute<{ id: string; year: string }>(sql`
        select id, school_year_id as year from core.academic_sessions
        where tenant_id = ${school.tenantId}::uuid and org_id = ${school.schoolId}::uuid
          and type = 'term' and status = 'active'
        order by lower(span) limit 1`);
      if (!term) throw new Error("a seeded term");
      const work = await discussionIn(tx, school);
      const scope = { tenantId: school.tenantId, assignmentId: work.id };
      await setTermOfWork(tx, { ...scope, periodId: term.id });
      await setTermOfWork(tx, { ...scope, periodId: term.id });
      expect(
        await termsOfWork(tx, {
          tenantId: school.tenantId,
          assignmentIds: [work.id],
        }),
      ).toEqual(new Map([[work.id, term.id]]));
      await setTermOfWork(tx, { ...scope, periodId: null });
      expect(
        (
          await termsOfWork(tx, {
            tenantId: school.tenantId,
            assignmentIds: [work.id],
          })
        ).size,
      ).toBe(0);

      await savePeriodGrade(tx, {
        tenantId: school.tenantId,
        orgId: school.schoolId,
        classId: school.classId,
        periodId: term.id,
        studentId: school.studentId,
        score: 77,
        maxScore: 100,
        comment: null,
        userId: school.teacherId,
        today: "2026-11-12",
      });
      await releasePeriodGrades(tx, {
        tenantId: school.tenantId,
        classId: school.classId,
        periodId: term.id,
      });
      expect(
        (
          await studentPeriodGrades(tx, {
            tenantId: school.tenantId,
            studentId: school.studentId,
            yearId: term.year,
          })
        ).find((row) => row.classId === school.classId),
      ).toMatchObject({ periodId: term.id, score: 77 });
    });
  });
});

describe("where evidence came from", () => {
  test("a sitting is one a lesson and student, or one handed-in work, and holds only its own kind of evidence", async () => {
    await inSchool(async (tx, school) => {
      const module = await moduleIn(tx, school);
      const lesson = await insertLesson(tx, {
        tenantId: school.tenantId,
        moduleId: module.id,
        title: "The Nile",
        completion: "view",
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
      const key = {
        tenantId: school.tenantId,
        lessonId: lesson.id,
        studentId: school.studentId,
      };
      const sitting = await lessonSitting(tx, key);
      expect(await lessonSitting(tx, key)).toBe(sitting);

      const [submission] = await tx.execute<{
        id: string;
        student: string;
      }>(sql`
        select id, student_user_id as student from core.submissions
        where tenant_id = ${school.tenantId}::uuid and status = 'active' limit 1`);
      if (!submission) throw new Error("a seeded submission");
      const work = await workSitting(tx, {
        tenantId: school.tenantId,
        submissionId: submission.id,
        studentId: submission.student,
      });
      expect(
        await workSitting(tx, {
          tenantId: school.tenantId,
          submissionId: submission.id,
          studentId: submission.student,
        }),
      ).toBe(work);

      const [standard] = await tx.execute<{ id: string }>(sql`
        with f as (
          insert into core.standard_frameworks (tenant_id, org_id, title)
          values (${school.tenantId}::uuid, ${school.schoolId}::uuid, 'Rivers') returning id)
        insert into core.standards (tenant_id, framework_id, statement, position)
        select ${school.tenantId}::uuid, f.id, 'Names a river.', 0 from f
        returning id`);
      if (!standard) throw new Error("standard not written");
      const mark = {
        attempt: 1,
        blockId: crypto.randomUUID(),
        standards: [standard.id],
        fraction: 0.5,
      };
      // A quiz's answer cannot sit on a lesson's sitting.
      expect(
        await refusal(tx, (inner) =>
          recordEvidence(inner, {
            tenantId: school.tenantId,
            studentId: school.studentId,
            sittingId: sitting,
            source: "quiz",
            marks: [mark],
            replace: true,
          }),
        ),
      ).toContain("standard_evidence");
      // Nor another student's answer on this student's sitting.
      if (submission.student !== school.studentId)
        expect(
          await refusal(tx, (inner) =>
            recordEvidence(inner, {
              tenantId: school.tenantId,
              studentId: submission.student,
              sittingId: sitting,
              source: "lesson",
              marks: [mark],
              replace: true,
            }),
          ),
        ).toContain("standard_evidence");
      const evidence = {
        tenantId: school.tenantId,
        studentId: school.studentId,
        sittingId: sitting,
        source: "lesson" as const,
        replace: true,
      };
      await recordEvidence(tx, { ...evidence, marks: [mark] });
      await recordEvidence(tx, {
        ...evidence,
        marks: [{ ...mark, fraction: 1 }],
      });
      const rows = await tx.execute<{ fraction: string }>(sql`
        select fraction::text from core.standard_evidence
        where tenant_id = ${school.tenantId}::uuid and sitting_id = ${sitting}::uuid
          and status = 'active'`);
      expect(rows.map((row) => Number(row.fraction))).toEqual([1]);
    });
  });
});
