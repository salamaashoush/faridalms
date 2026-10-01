import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { login, rejection, seeded, signedIn } from "./harness";

const names = (en: string, ar: string) => ({
  en: { given: en.split(" ")[0], family: en.split(" ").slice(1).join(" ") },
  ar: { given: ar.split(" ")[0], family: ar.split(" ").slice(1).join(" ") },
});

/** Adds a student whose only school year ended on 30 June 2020. */
async function leaver(api: Awaited<ReturnType<typeof signedIn>>) {
  const options = await api.people.options();
  const grade = options.grades.find((row) => row.code === "grade_7");
  if (!grade) throw new Error("options");
  const created = await api.people.saveStudent({
    names: names("Salama Leaver", "سلامة المغادر"),
    reference: "GA9301",
    birthDate: "2002-05-20",
    gradeId: grade.id,
    guardians: [],
  });
  const { id: pastYearId } = await api.years.save({
    titleEn: "2019–2020",
    titleAr: "",
    startsOn: "2019-09-01",
    endsOn: "2020-06-30",
    terms: [],
  });
  const { cell, tenants } = seeded();
  const tenantId = tenants[0]?.tenantId ?? "";
  await cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "write",
    (tx) =>
      tx.execute(sql`
        update core.student_school_years
        set school_year_id = ${pastYearId}::uuid, calendar_id = null,
            valid_during = daterange('2019-09-01', '2020-07-01')
        where tenant_id = ${tenantId}::uuid and student_user_id = ${created.id}::uuid`),
  );
  return created.id;
}

describe("retention review", () => {
  test("a leaver comes up under the school's rules, and a legal hold blocks them until released", async () => {
    const api = await signedIn("northwind", login("principal"));
    const id = await leaver(api);

    const before = await api.privacy.overview();
    const listed = before.review.find((row) => row.userId === id);
    expect(listed).toMatchObject({
      kind: "student",
      leftOn: "2020-06-30",
      dueOn: null,
      block: null,
    });

    await api.privacy.saveRetention({
      studentRule: "years_after_leaving",
      studentValue: 5,
      staffYears: 6,
    });
    const ruled = await api.privacy.overview();
    expect(ruled.rules).toEqual({
      studentRule: "years_after_leaving",
      studentValue: 5,
      staffYears: 6,
    });
    expect(ruled.review.find((row) => row.userId === id)?.dueOn).toBe(
      "2025-06-30",
    );

    await api.privacy.saveRetention({
      studentRule: "until_age",
      studentValue: 25,
      staffYears: 6,
    });
    expect(
      (await api.privacy.overview()).review.find((row) => row.userId === id)
        ?.dueOn,
    ).toBe("2027-05-20");

    const { id: holdId } = await api.privacy.placeHold({
      subjectUserId: id,
      reason: "Records requested by the education directorate.",
    });
    const held = await api.privacy.overview();
    expect(held.review.find((row) => row.userId === id)?.block).toEqual({
      kind: "hold",
      reason: "Records requested by the education directorate.",
    });
    expect(held.holds.map((row) => row.id)).toContain(holdId);

    await api.privacy.releaseHold({ id: holdId });
    const released = await api.privacy.overview();
    expect(released.review.find((row) => row.userId === id)?.block).toBeNull();
    expect(released.holds.map((row) => row.id)).not.toContain(holdId);
    expect(
      await rejection(api.privacy.releaseHold({ id: holdId })),
    ).toMatchObject({ code: "NOT_FOUND", message: "privacy.hold_unknown" });
  });

  test("only those who keep the register reach it, and a hold names someone the school has had", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    expect(await rejection(teacher.privacy.overview())).toMatchObject({
      code: "FORBIDDEN",
    });
    const api = await signedIn("northwind", login("principal"));
    expect(
      await rejection(
        api.privacy.placeHold({
          subjectUserId: crypto.randomUUID(),
          reason: "A claim was filed.",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND", message: "privacy.person_unknown" });
    expect(
      await rejection(
        api.privacy.saveRetention({
          studentRule: "until_age",
          studentValue: 16,
          staffYears: null,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
  });
});
