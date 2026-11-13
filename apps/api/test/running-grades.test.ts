import { addDays } from "@faridalms/domain/school";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import {
  login,
  rejection,
  seeded,
  signedIn,
  testCell,
  withoutModules,
} from "./harness";

type Api = Awaited<ReturnType<typeof signedIn>>;

function tenantOf(slug: string) {
  const index = seeded().tenants.findIndex((tenant) =>
    tenant.schools.some((school) => school.slug === slug),
  );
  if (index < 0) throw new Error(`the seed lacks ${slug}`);
  return index;
}

const academy = (role: string, index = 0) =>
  signedIn("lanternfield", login(role, tenantOf("lanternfield"), index));

const principal = () => signedIn("northwind", login("principal"));
const arabicTeacher = () => signedIn("northwind", login("teacher", 0, 1));
const englishTeacher = () => signedIn("northwind", login("teacher", 0, 2));
const pupil = () => signedIn("northwind", login("student"));
const parentLogin = () => login("student").replace("student", "parent");

async function auditCount(action: string, objectId: string) {
  const admin = new SQL(testCell().adminUrl);
  try {
    const [row] = (await admin.unsafe(
      `select count(*)::int as count from audit.log
       where action = $1 and object_id = $2::uuid and actor_user_id is not null`,
      [action, objectId],
    )) as { count: number }[];
    return row?.count ?? 0;
  } finally {
    await admin.close();
  }
}

async function classNamed(api: Api, code: string) {
  const { classes } = await api.coursework.options();
  const found = classes.find((row) => row.code === code);
  if (!found) throw new Error(`no class ${code}`);
  return found.id;
}

/** Shows or hides a class's running grades as its teacher, from whatever it shows now. */
async function setShown(api: Api, classId: string, shown: boolean) {
  const now = await api.gradebook.runningShown({ classId });
  return api.gradebook.showRunning({
    classId,
    shown,
    expectedVersion: now.version,
  });
}

describe("running grades at a school without years", () => {
  test("a learner sees the running grade of a class that shows it, made of the work returned to them", async () => {
    const learner = await academy("student", 0);
    const { classes } = await learner.gradebook.running({});
    const python = classes.find((row) => row.code === "PY-EVE");
    expect(python).toMatchObject({ span: null, percent: 90 });
    expect(python?.grade?.labelEn).toBe("Excellent");
    // Only returned work counts: the exercise handed in and not yet returned is not a part.
    expect(python?.parts).toEqual([
      expect.objectContaining({
        title: "Variables and types",
        score: 9,
        points: 10,
        excused: false,
        weight: 100,
        categoryTitleEn: "Exercises",
      }),
    ]);
  });

  test("the class's teacher reads it, and another learner and a teacher of another class cannot", async () => {
    const learner = await academy("student", 0);
    const me = await learner.identity.currentUser();
    const own = await learner.gradebook.running({});
    const teacher = await academy("teacher", 0);
    expect(await teacher.gradebook.running({ studentId: me.id })).toEqual(own);
    const outsiders = await Promise.all([
      academy("student", 1),
      academy("teacher", 1),
    ]);
    const refused = await Promise.all(
      outsiders.map((outsider) =>
        rejection(outsider.gradebook.running({ studentId: me.id })),
      ),
    );
    for (const each of refused)
      expect(each).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a class shows nothing until its teacher shows it; the change is audited and only its teacher makes it", async () => {
    const teacher = await academy("teacher", 1);
    const learner = await academy("student", 6);
    const classId = await classNamed(teacher, "WEB-AUT");
    expect(
      (await learner.gradebook.running({})).classes.map((row) => row.code),
    ).not.toContain("WEB-AUT");

    const python = await classNamed(await academy("teacher", 0), "PY-EVE");
    expect(
      await rejection(teacher.gradebook.runningShown({ classId: python })),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await rejection(
        learner.gradebook.showRunning({
          classId,
          shown: true,
          expectedVersion: 0,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });

    const before = await auditCount("running_grade.show", classId);
    await setShown(teacher, classId, true);
    try {
      expect(await auditCount("running_grade.show", classId)).toBe(before + 1);
      expect(
        await rejection(
          teacher.gradebook.showRunning({
            classId,
            shown: false,
            expectedVersion: 0,
          }),
        ),
      ).toMatchObject({ code: "CONFLICT" });
      const web = (await learner.gradebook.running({})).classes.find(
        (row) => row.code === "WEB-AUT",
      );
      expect(web).toMatchObject({ percent: 100 });
      expect(web?.parts.map((part) => part.title)).toEqual([
        "A page about yourself",
      ]);
    } finally {
      await setShown(teacher, classId, false);
    }
    expect(await auditCount("running_grade.hide", classId)).toBeGreaterThan(0);
    expect(
      (await learner.gradebook.running({})).classes.map((row) => row.code),
    ).not.toContain("WEB-AUT");
  });

  test("the school's default reaches only classes made after it, and only grading keepers set it", async () => {
    const office = await academy("site_administrator");
    const teacher = await academy("teacher", 0);
    const teacherMe = await teacher.identity.currentUser();
    expect(
      await rejection(
        teacher.gradebook.setRunningDefault({
          runningShown: true,
          expectedVersion: 0,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    const before = await office.gradebook.runningDefault();
    expect(before.runningShown).toBe(false);
    const saved = await office.gradebook.setRunningDefault({
      runningShown: true,
      expectedVersion: before.version,
    });
    try {
      const { today } = await office.identity.currentUser();
      const made = await office.classes.save({
        code: `RUN-${crypto.randomUUID().slice(0, 6)}`,
        titleEn: "A class made after the default",
        titleAr: "",
        teacherIds: [teacherMe.id],
        startsOn: today,
        endsOn: addDays(today, 30),
      });
      expect(
        (await teacher.gradebook.runningShown({ classId: made.id })).shown,
      ).toBe(true);
      const python = await classNamed(teacher, "PY-EVE");
      expect(
        (await teacher.gradebook.runningShown({ classId: python })).shown,
      ).toBe(true);
      const autumn = await classNamed(await academy("teacher", 1), "WEB-AUT");
      expect(
        (
          await (
            await academy("teacher", 1)
          ).gradebook.runningShown({ classId: autumn })
        ).shown,
      ).toBe(false);
    } finally {
      await office.gradebook.setRunningDefault({
        runningShown: false,
        expectedVersion: saved.version,
      });
    }
  });
});

describe("running grades at a school with terms and families", () => {
  test("a learner sees the running grade of the current term as provisional, and the released term grade is untouched", async () => {
    const student = await pupil();
    const released = await student.gradebook.student({});
    const { classes } = await student.gradebook.running({});
    const arabic = classes.find((row) => row.code === "8-A-ARAB");
    expect(arabic?.span?.titleEn).toBeTruthy();
    expect(arabic?.parts.map((part) => part.title)).toEqual([
      "Chapter 1 review",
    ]);
    expect(arabic?.percent).toBe(80);
    expect(await student.gradebook.student({})).toEqual(released);
  });

  test("a guardian who follows the learner reads it; one without portal access does not, nor any with families off", async () => {
    const student = await pupil();
    const me = await student.identity.currentUser();
    const own = await student.gradebook.running({});
    const parent = await signedIn("northwind", parentLogin());
    expect(await parent.gradebook.running({ studentId: me.id })).toEqual(own);

    const office = await principal();
    const parentMe = await parent.identity.currentUser();
    const linkOf = async () => {
      const found = (
        await office.guardians.ofStudent({ studentId: me.id })
      ).guardians.find((row) => row.userId === parentMe.id);
      if (!found) throw new Error("the parent is linked to the child");
      return found;
    };
    const link = await linkOf();
    const flags = {
      relationId: link.relationId,
      legalGuardian: link.legalGuardian,
      portalAccess: link.portalAccess,
      receivesNotifications: link.receivesNotifications,
      primaryContact: link.primaryContact,
      emergencyContact: link.emergencyContact,
      residence: link.residence,
      pickup: link.pickup,
    };
    await office.guardians.saveLink({
      studentId: me.id,
      relationshipId: link.relationshipId,
      expectedVersion: link.version,
      flags: { ...flags, portalAccess: false },
    });
    try {
      expect(
        await rejection(parent.gradebook.running({ studentId: me.id })),
      ).toMatchObject({
        code: expect.stringMatching(/^(NOT_FOUND|UNAUTHORIZED)$/),
      });
    } finally {
      const now = await linkOf();
      await office.guardians.saveLink({
        studentId: me.id,
        relationshipId: now.relationshipId,
        expectedVersion: now.version,
        flags,
      });
    }

    await withoutModules("northwind", ["families"], async () => {
      expect(
        await rejection(parent.gradebook.running({ studentId: me.id })),
      ).toMatchObject({
        code: expect.stringMatching(/^(NOT_FOUND|UNAUTHORIZED)$/),
      });
    });
  });

  test("a teacher shows a class's running grade over the term the book shows, and a teacher of another class cannot", async () => {
    const teacher = await arabicTeacher();
    const { classes } = await teacher.coursework.options();
    const other = classes.find(
      (item) => item.code !== "8-A-ARAB" && item.subjectId !== null,
    );
    if (!other) throw new Error("the Arabic teacher teaches another class");
    const classId = other.id;
    const book = await teacher.gradebook.classBook({ classId });
    const learnerId = book.students[0]?.id;
    if (!learnerId) throw new Error("the class has students");
    expect(
      await rejection(
        (await englishTeacher()).gradebook.runningShown({ classId }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    const inClass = async () =>
      (
        await teacher.gradebook.running({ studentId: learnerId })
      ).classes.filter((row) => row.classId === classId);
    expect(await inClass()).toEqual([]);
    await setShown(teacher, classId, true);
    try {
      const [shown] = await inClass();
      const term = book.term?.terms.find(
        (each) => each.id === book.term?.currentPeriodId,
      );
      expect(shown?.span?.titleEn ?? null).toBe(term?.titleEn ?? null);
      const inBook = new Set(book.assignments.map((work) => work.id));
      expect(shown?.parts.every((part) => inBook.has(part.assignmentId))).toBe(
        true,
      );
    } finally {
      await setShown(teacher, classId, false);
    }
  });
});
