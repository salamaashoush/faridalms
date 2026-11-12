import { MODULE_IDS } from "@faridalms/domain/modules";
import { describe, expect, test } from "bun:test";

import { login, rejection, seeded, setPlan, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));

async function yearsOf(api: Awaited<ReturnType<typeof principal>>) {
  const { years } = await api.years.directory();
  const source = years.find((row) => row.lifecycle === "current");
  if (!source) throw new Error("seed current year");
  return { source, years };
}

describe("year rollover", () => {
  test("a draft is proposed, saved, applied once and read back in the target year", async () => {
    const api = await principal();
    const { source } = await yearsOf(api);
    const { id: targetId } = await api.years.save({
      titleEn: "2031–2032",
      titleAr: "",
      startsOn: "2031-09-07",
      endsOn: "2032-06-10",
      terms: [],
    });
    const query = { sourceYearId: source.id, targetYearId: targetId };

    const first = await api.rollover.preview(query);
    expect(first).toMatchObject({ state: "new", version: 0, issue: null });
    expect(first.plan.classes).toHaveLength(first.sources.length);
    const rosterOf = (classId: string) =>
      first.students.filter((row) => row.classId === classId);
    const kept = first.plan.classes.find(
      (row) => rosterOf(row.sourceClassId).length >= 3,
    );
    const dropped = first.plan.classes.find(
      (row) => row.key !== kept?.key && rosterOf(row.sourceClassId).length > 0,
    );
    if (!kept || !dropped) throw new Error("seed homerooms");
    const keptSource = first.sources.find(
      (row) => row.id === kept.sourceClassId,
    );
    expect(kept.code).toBe(keptSource?.code ?? "");
    expect(kept.subjects.length).toBeGreaterThan(0);
    expect(first.plan.students).toHaveLength(first.students.length);

    const [leaver, graduate, repeater] = rosterOf(kept.sourceClassId);
    if (!leaver || !graduate || !repeater) throw new Error("seed roster");
    const plan = {
      classes: first.plan.classes.map((row) =>
        row.key === dropped.key
          ? { ...row, include: false }
          : row.key === kept.key
            ? { ...row, code: `${row.code}-N` }
            : row,
      ),
      students: first.plan.students.map((row) => {
        if (row.studentId === leaver.id)
          return { ...row, outcome: "leave" as const, targetKey: "" };
        if (row.studentId === graduate.id)
          return { ...row, outcome: "graduate" as const, targetKey: "" };
        if (row.studentId === repeater.id)
          return { ...row, outcome: "retain" as const, targetKey: kept.key };
        const origin = first.students.find((item) => item.id === row.studentId);
        return origin?.classId === dropped.sourceClassId || !row.targetKey
          ? { ...row, outcome: "leave" as const, targetKey: "" }
          : row;
      }),
    };
    expect(
      await rejection(
        api.rollover.save({
          ...query,
          expectedVersion: 0,
          plan: {
            ...plan,
            students: plan.students.map((row) =>
              row.studentId === leaver.id
                ? { ...row, targetKey: kept.key }
                : row,
            ),
          },
        }),
      ),
    ).toMatchObject({ message: "rollover.target_for_leaver" });
    const saved = await api.rollover.save({
      ...query,
      expectedVersion: 0,
      plan,
    });
    expect(saved.version).toBe(1);
    expect(
      await rejection(
        api.rollover.save({ ...query, expectedVersion: 0, plan }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "conflict.version" });
    expect((await api.rollover.preview(query)).reconciled).toBe(false);

    const staying = plan.students.filter(
      (row) => row.outcome === "promote" || row.outcome === "retain",
    ).length;
    const [a, b] = await Promise.all([
      api.rollover.apply({ ...query, expectedVersion: 1 }),
      api.rollover.apply({ ...query, expectedVersion: 1 }),
    ]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ placed: staying, graduated: 1 });
    expect(a.classes).toHaveLength(first.plan.classes.length - 1);
    expect(
      await rejection(
        api.rollover.save({ ...query, expectedVersion: 1, plan }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "rollover.applied" });

    const target = await api.homerooms.directory({
      views: { year: targetId },
    });
    expect(target.rows).toHaveLength(
      first.plan.classes.filter((row) => row.carrier === "homerooms").length -
        1,
    );
    const carried = target.rows.find((row) => row.code === `${kept.code}-N`);
    if (!carried) throw new Error("carried class");
    expect(carried.subjects).toHaveLength(kept.subjects.length);
    expect(carried.teachers[0]?.userId).toBe(kept.teacherId);
    const record = await api.classes.record({
      id: carried.id,
      on: "2031-09-07",
    });
    expect(record.roster.map((row) => row.userId)).toContain(repeater.id);
    expect(record.roster.map((row) => row.userId)).not.toContain(leaver.id);

    const left = await api.years.placementsOf({ studentId: graduate.id });
    expect(
      left.placements.find((row) => row.schoolYearId === source.id)
        ?.exitMeaning,
    ).toBe("graduated");
    // Those who go leave on the year's last day and read their record until
    // the new year begins without them; those who stay have no such day.
    const departure = {
      leftOn: source.endsBefore,
      accessEndsOn: "2031-09-07",
    };
    expect((await api.people.student({ id: graduate.id })).departure).toEqual(
      departure,
    );
    expect((await api.people.student({ id: leaver.id })).departure).toEqual(
      departure,
    );
    expect(
      (await api.people.student({ id: repeater.id })).departure,
    ).toBeNull();
    const sourceRecord = await api.classes.record({
      id: kept.sourceClassId,
    });
    expect(sourceRecord.roster.map((row) => row.userId)).toContain(leaver.id);
  });

  test("a year not yet started cannot be rolled over into an earlier one", async () => {
    const api = await principal();
    const { source, years: all } = await yearsOf(api);
    const later = all.find((row) => row.startsOn > source.startsOn);
    if (!later) throw new Error("later year from the earlier test");
    const preview = await api.rollover.preview({
      sourceYearId: later.id,
      targetYearId: source.id,
    });
    expect(preview.issue).toBe("rollover.source_not_started");
  });
});

describe("a rollover in a school without homerooms", () => {
  test("carries the year's classes as themselves, their staying students with them", async () => {
    const school = seeded()
      .tenants.flatMap((tenant) => tenant.schools)
      .find((row) => row.slug === "acme");
    if (!school) throw new Error("no acme school");
    await setPlan(school.id, {
      modules: MODULE_IDS.filter((module) => module !== "homerooms"),
    });
    try {
      const api = await signedIn("acme", login("principal", 1));
      const { years } = await api.years.directory();
      const source = years.find((row) => row.lifecycle === "current");
      if (!source) throw new Error("seed current year");
      const { id: targetId } = await api.years.save({
        titleEn: "2033–2034",
        titleAr: "",
        startsOn: "2033-09-04",
        endsOn: "2034-06-15",
        terms: [],
      });
      const query = { sourceYearId: source.id, targetYearId: targetId };
      const first = await api.rollover.preview(query);
      expect(first.plan.classes.length).toBeGreaterThan(0);
      expect(
        first.plan.classes.every(
          (row) => row.carrier === "" && row.include && row.students,
        ),
      ).toBe(true);
      expect(first.plan.students.every((row) => row.targetKey === "")).toBe(
        true,
      );
      const followed = first.sources.find((row) => row.studentIds.length > 0);
      if (!followed) throw new Error("seed class with students");
      const saved = await api.rollover.save({
        ...query,
        expectedVersion: 0,
        plan: first.plan,
      });
      const applied = await api.rollover.apply({
        ...query,
        expectedVersion: saved.version,
      });
      expect(applied.classes).toHaveLength(first.plan.classes.length);
      const made = applied.classes.find(
        (row) =>
          row.key ===
          first.plan.classes.find((item) => item.sourceClassId === followed.id)
            ?.key,
      );
      if (!made) throw new Error("carried class");
      const record = await api.classes.record({
        id: made.classId,
        on: "2033-09-04",
      });
      expect(record.runs).toEqual({ from: "2033-09-04", to: "2034-06-16" });
      expect(record.roster).toHaveLength(followed.studentIds.length);
      expect(
        (await api.years.ofClass({ classId: made.classId })).year?.id,
      ).toBe(targetId);
    } finally {
      await setPlan(school.id, null);
    }
  });
});

describe("re-enrolment", () => {
  test("families are asked once, one answer settles the question, and the rollover reads it", async () => {
    const api = await principal();
    const { source } = await yearsOf(api);
    const { id: targetId } = await api.years.save({
      titleEn: "2061–2062",
      titleAr: "",
      startsOn: "2061-09-04",
      endsOn: "2062-06-08",
      terms: [],
    });
    const { asked } = await api.rollover.openReenrolment({
      yearId: source.id,
    });
    expect(asked).toBeGreaterThan(0);
    expect(
      await rejection(api.rollover.openReenrolment({ yearId: source.id })),
    ).toMatchObject({ code: "CONFLICT", message: "reenrolment.opened" });

    const family = await signedIn("northwind", login("parent"));
    const [child] = (await family.home.followed({})).children;
    if (!child) throw new Error("seed child");
    const waiting = await family.notifications.list({ tab: "action" });
    expect(
      waiting.rows.some(
        (row) =>
          row.kind === "reenrolment" &&
          row.params.studentId === child.studentId,
      ),
    ).toBe(true);
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.rollover.setIntention({
          studentId: child.studentId,
          intention: "leaving",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      await family.rollover.setIntention({
        studentId: child.studentId,
        intention: "leaving",
      }),
    ).toEqual({ intention: "leaving" });
    expect(
      (await family.notifications.list({ tab: "action" })).rows.some(
        (row) =>
          row.kind === "reenrolment" &&
          row.params.studentId === child.studentId,
      ),
    ).toBe(false);

    const preview = await api.rollover.preview({
      sourceYearId: source.id,
      targetYearId: targetId,
    });
    expect(
      preview.students.find((row) => row.id === child.studentId)?.intention,
    ).toBe("leaving");
  });
});
