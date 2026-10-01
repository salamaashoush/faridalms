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

  test("a records request runs on its law's clock and blocks erasure while open", async () => {
    const api = await signedIn("northwind", login("principal"));
    const { review } = await api.privacy.overview();
    const subject = review[0];
    if (!subject) throw new Error("the first test leaves a leaver");
    const base = {
      subjectUserId: subject.userId,
      requestedBy: "Salama Ashoush",
      relation: "self" as const,
      kind: "access" as const,
      receivedOn: "2026-03-02",
      clockFrom: "2026-03-02",
      dueOn: null,
      details: "",
    };

    const uk = await api.privacy.saveRequest({ ...base, law: "uk_gdpr" });
    expect(uk.dueOn).toBe("2026-04-02");
    const us = await api.privacy.saveRequest({ ...base, law: "ferpa" });
    expect(us.dueOn).toBe("2026-04-16");
    expect(
      await rejection(
        api.privacy.saveRequest({ ...base, law: "other", kind: "objection" }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });

    const blocked = await api.privacy.overview();
    expect(
      blocked.review.find((row) => row.userId === subject.userId)?.block,
    ).toEqual({ kind: "request", dueOn: "2026-04-02" });

    expect(
      await api.privacy.extendRequest({
        id: uk.id,
        reason: "Records span several systems.",
      }),
    ).toEqual({ extendedTo: "2026-06-02" });
    expect(
      await rejection(
        api.privacy.extendRequest({ id: us.id, reason: "Complex." }),
      ),
    ).toMatchObject({ message: "privacy.no_extension" });
    const edited = await api.privacy.saveRequest({
      ...base,
      id: uk.id,
      law: "uk_gdpr",
      details: "Asked for exam scripts too.",
    });
    expect(edited.dueOn).toBe("2026-04-02");
    expect(
      (await api.privacy.overview()).requests.find((row) => row.id === uk.id)
        ?.extendedTo,
    ).toBe("2026-06-02");

    for (const id of [uk.id, us.id])
      await api.privacy.closeRequest({
        id,
        outcome: "completed",
        note: "Copies sent by email.",
      });
    const closed = await api.privacy.overview();
    expect(
      closed.review.find((row) => row.userId === subject.userId)?.block,
    ).toBeNull();
    expect(closed.requests.find((row) => row.id === uk.id)?.outcome).toBe(
      "completed",
    );
    expect(
      await rejection(
        api.privacy.closeRequest({
          id: uk.id,
          outcome: "withdrawn",
          note: "Again.",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND", message: "privacy.request_closed" });
  });

  test("a breach is told to whom its law requires before it can be closed", async () => {
    const api = await signedIn("northwind", login("principal"));
    const { id } = await api.privacy.saveBreach({
      title: "Report cards emailed to the wrong family",
      description: "One family received another child's term report.",
      discoveredAt: "2026-10-01T08:00:00.000Z",
      law: "egypt",
      risk: "unlikely",
      peopleAffected: 1,
    });
    const logged = (await api.privacy.overview()).breaches.find(
      (row) => row.id === id,
    );
    expect(logged).toMatchObject({
      regulatorRequired: true,
      regulatorDueAt: "2026-10-04T08:00:00.000Z",
      peopleRequired: true,
    });
    expect((logged?.peopleDueOn ?? "") > "2026-10-01").toBe(true);

    expect(
      await rejection(
        api.privacy.closeBreach({ id, actions: "Emails now checked twice." }),
      ),
    ).toMatchObject({ message: "privacy.breach_notices_open" });
    expect(
      await rejection(
        api.privacy.breachNotices({
          id,
          regulatorNotifiedAt: "2026-10-02T10:00:00.000Z",
          regulatorReference: null,
          regulatorReason: "Not needed.",
          peopleNotifiedAt: null,
          peopleReason: null,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    await api.privacy.breachNotices({
      id,
      regulatorNotifiedAt: "2026-10-02T10:00:00.000Z",
      regulatorReference: "PDPC-2026-0042",
      regulatorReason: null,
      peopleNotifiedAt: "2026-10-02T12:00:00.000Z",
      peopleReason: null,
    });
    await api.privacy.closeBreach({ id, actions: "Emails now checked twice." });
    const closed = (await api.privacy.overview()).breaches.find(
      (row) => row.id === id,
    );
    expect(closed?.closedAt).not.toBeNull();
    expect(closed?.regulatorReference).toBe("PDPC-2026-0042");
    expect(
      await rejection(api.privacy.closeBreach({ id, actions: "Again." })),
    ).toMatchObject({ code: "NOT_FOUND", message: "privacy.breach_closed" });
  });
});
