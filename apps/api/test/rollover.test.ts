import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

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
    expect(first.plan.classes).toHaveLength(first.homerooms.length);
    const rosterOf = (classId: string) =>
      first.students.filter((row) => row.classId === classId);
    const kept = first.plan.classes.find(
      (row) => rosterOf(row.sourceClassId).length >= 3,
    );
    const dropped = first.plan.classes.find(
      (row) => row.key !== kept?.key && rosterOf(row.sourceClassId).length > 0,
    );
    if (!kept || !dropped) throw new Error("seed homerooms");
    const keptSource = first.homerooms.find(
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

    const target = await api.classes.directory({ year: targetId });
    expect(target.rows).toHaveLength(first.plan.classes.length - 1);
    const carried = target.rows.find((row) => row.code === `${kept.code}-N`);
    if (!carried) throw new Error("carried class");
    expect(carried.subjects).toHaveLength(kept.subjects.length);
    expect(carried.teachers[0]?.userId).toBe(kept.homeroomTeacherId);
    const record = await api.classes.record({
      id: carried.id,
      on: "2031-09-07",
    });
    expect(record.roster.map((row) => row.userId)).toContain(repeater.id);
    expect(record.roster.map((row) => row.userId)).not.toContain(leaver.id);

    const left = await api.people.student({ id: graduate.id });
    expect(
      left.placements.find((row) => row.schoolYearId === source.id)
        ?.exitMeaning,
    ).toBe("graduated");
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
