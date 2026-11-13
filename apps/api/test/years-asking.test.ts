import { addYears } from "@faridalms/domain/privacy";
import { addDays } from "@faridalms/domain/school";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import { names } from "./admission-fixtures";
import {
  client,
  login,
  rejection,
  seeded,
  signedIn,
  testCell,
  withoutModules,
} from "./harness";

type Api = Awaited<ReturnType<typeof signedIn>>;

const PASSWORD = "a long learner password";

function tenantOf(slug: string) {
  const index = seeded().tenants.findIndex((tenant) =>
    tenant.schools.some((school) => school.slug === slug),
  );
  if (index < 0) throw new Error(`the seed lacks ${slug}`);
  return index;
}

const office = () => signedIn("acme", login("principal", tenantOf("acme")));

/** Gives a person of the school a sign-in of their own and signs them in. */
async function signInOf(head: Api, userId: string, loginName: string) {
  await head.people.saveSignIn({ userId, loginName, password: PASSWORD });
  const session = await client("acme").identity.signIn({
    loginName,
    password: PASSWORD,
  });
  return client("acme", session.token);
}

async function setBirthDate(head: Api, studentId: string, birthDate: string) {
  const current = await head.people.student({ id: studentId });
  await head.people.saveStudent({
    id: studentId,
    expectedVersion: current.version,
    names: names(current.fullNameEn ?? "", current.fullNameAr ?? ""),
    reference: current.reference ?? "",
    birthDate,
  });
}

async function setAdults(head: Api, adults: boolean) {
  const profile = await head.school.profile();
  await head.school.saveProfile({
    expectedVersion: profile.version,
    nameEn: profile.nameEn ?? "",
    nameAr: profile.nameAr ?? "",
    identifier: profile.identifier ?? "",
    timeZone: profile.timeZone ?? "Asia/Dubai",
    defaultLocale: profile.defaultLocale,
    weekStart: profile.weekStart,
    weekendDays: profile.weekendDays,
    secondaryCalendar: profile.secondaryCalendar ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    learnersAreAdults: adults,
  });
}

async function answersRecorded(studentId: string) {
  const admin = new SQL(testCell().adminUrl);
  try {
    const rows = (await admin.unsafe(
      `select details->>'by' as by, details->>'intention' as intention
       from audit.log where action = 'reenrolment.intention'
         and subject_user_id = $1::uuid order by occurred_at, id`,
      [studentId],
    )) as { by: string; intention: string }[];
    return rows.map((row) => `${row.by}:${row.intention}`);
  } finally {
    await admin.close();
  }
}

describe("asking whether each learner returns", () => {
  test("the learner who decides answers for themself, with or without families, and both answer where both decide", async () => {
    const head = await office();
    const { today } = await head.identity.currentUser();
    const { years } = await head.years.directory();
    const source = years.find((row) => row.lifecycle === "current");
    if (!source) throw new Error("acme has no current year");
    // A year far ahead, clear of the next year the years suite gives Acme.
    const target = await head.years.save({
      titleEn: "Acme 2071–2072",
      titleAr: "",
      startsOn: "2071-09-06",
      endsOn: "2072-06-10",
      terms: [],
    });
    const preview = await head.rollover.preview({
      sourceYearId: source.id,
      targetYearId: target.id,
    });
    const [first, second] = preview.students;
    if (!first || !second) throw new Error("acme has too few students");
    const eighteen = addYears(today, -18);
    await setBirthDate(head, first.id, eighteen);
    await setBirthDate(head, second.id, addDays(eighteen, 1));
    const adult = await signInOf(
      head,
      first.id,
      "adult.learner@acme.example.com",
    );
    const young = await signInOf(
      head,
      second.id,
      "young.learner@acme.example.com",
    );

    await withoutModules("acme", ["families"], async () => {
      const { asked } = await head.rollover.openReenrolment({
        yearId: source.id,
      });
      expect(asked).toBeGreaterThan(0);
      const notices = (await adult.notifications.list({ tab: "action" })).rows;
      expect(
        notices.find(
          (row) =>
            row.kind === "reenrolment" && row.params.studentId === first.id,
        )?.params.own,
      ).toBe(true);
      expect(
        (await young.notifications.list({ tab: "action" })).rows.some(
          (row) => row.kind === "reenrolment",
        ),
      ).toBe(false);

      expect(
        (await adult.rollover.asking()).map((row) => row.studentId),
      ).toEqual([first.id]);
      expect(
        await adult.rollover.setIntention({
          studentId: first.id,
          intention: "returning",
        }),
      ).toEqual({ intention: "returning" });
      expect(await young.rollover.asking()).toEqual([]);
      expect(
        await rejection(
          young.rollover.setIntention({
            studentId: second.id,
            intention: "leaving",
          }),
        ),
      ).toMatchObject({ code: "FORBIDDEN" });
      expect(
        await rejection(
          adult.rollover.setIntention({
            studentId: second.id,
            intention: "leaving",
          }),
        ),
      ).toMatchObject({ code: "FORBIDDEN" });

      await setAdults(head, true);
      try {
        expect(
          (await young.rollover.asking()).map((row) => row.studentId),
        ).toEqual([second.id]);
        await young.rollover.setIntention({
          studentId: second.id,
          intention: "undecided",
        });
      } finally {
        await setAdults(head, false);
      }
    });

    const guardian = (await head.guardians.ofStudent({ studentId: first.id }))
      .guardians[0];
    if (!guardian) throw new Error("the learner has no guardian");
    const parent = await signInOf(
      head,
      guardian.userId,
      "guardian.of.adult@acme.example.com",
    );
    await parent.rollover.setIntention({
      studentId: first.id,
      intention: "leaving",
    });
    await adult.rollover.setIntention({
      studentId: first.id,
      intention: "undecided",
    });
    const read = await head.rollover.preview({
      sourceYearId: source.id,
      targetYearId: target.id,
    });
    expect(read.students.find((row) => row.id === first.id)?.intention).toBe(
      "undecided",
    );
    expect(await answersRecorded(first.id)).toEqual([
      "self:returning",
      "family:leaving",
      "self:undecided",
    ]);
    expect(
      await rejection(
        young.rollover.setIntention({
          studentId: second.id,
          intention: "leaving",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
