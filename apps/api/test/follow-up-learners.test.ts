import { addYears } from "@faridalms/domain/privacy";
import { addDays } from "@faridalms/domain/school";
import { dayOpen } from "@faridalms/domain/school-days";
import { describe, expect, test } from "bun:test";

import { names } from "./admission-fixtures";
import {
  login,
  periodOf,
  rejection,
  runDay,
  schoolDayBack,
  seeded,
  sessionFor,
  signedIn,
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

/** The latest day on or before `day` the school is open. */
async function lastOpenDay(api: Api, day: string) {
  const read = await api.schoolDays.days({ from: addDays(day, -30), to: day });
  const marks = new Map(read.days.map((row) => [row.day, row.meaning]));
  for (let on = day; on >= read.from; on = addDays(on, -1))
    if (dayOpen(read, on, marks.get(on) ?? null)) return on;
  throw new Error("the school has had no open day");
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
    timeZone: profile.timeZone ?? "Africa/Cairo",
    defaultLocale: profile.defaultLocale,
    weekStart: profile.weekStart,
    weekendDays: profile.weekendDays,
    secondaryCalendar: profile.secondaryCalendar ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    learnersAreAdults: adults,
  });
}

describe("following up the absence of a learner who answers for themself", () => {
  test("an academy without families calls the learner, then their own emergency contacts, and logs the call", async () => {
    const academy = tenantOf("lanternfield");
    const office = await signedIn(
      "lanternfield",
      login("site_administrator", academy),
    );
    const learner = await sessionFor(
      "lanternfield",
      login("student", academy, 4),
    );
    const me = await learner.api.identity.currentUser();
    const date = await lastOpenDay(office, me.today);
    const klass = await office.classes.save({
      code: `FU-${crypto.randomUUID().slice(0, 6)}`,
      titleEn: "Follow-up practice",
      titleAr: "",
      teacherIds: [],
      startsOn: addDays(date, -7),
      endsOn: addDays(date, 30),
    });
    await office.classes.enrol({
      studentId: me.id,
      classId: klass.id,
      from: addDays(date, -7),
    });
    const contact = await learner.api.people.saveEmergencyContact({
      personId: me.id,
      name: "Salama Ashoush",
      relationship: "Brother",
      phone: "0100 000 0181",
      otherPhone: "",
      email: "",
      callOrder: 1,
      notes: "",
    });
    const register = await office.attendance.register({
      classId: klass.id,
      date,
    });
    await office.attendance.save({
      classId: klass.id,
      date,
      periodId: register.period?.id ?? "",
      expectedVersion: register.register?.version ?? 0,
      marks: register.students.map((row) => ({
        studentId: row.id,
        meaning: "absent" as const,
      })),
    });

    const call = (await office.followUp.day({ date })).followUp.calls.find(
      (row) => row.studentId === me.id,
    );
    const kinds = call?.callees.map((row) => row.kind) ?? [];
    expect(kinds[0]).toBe("self");
    expect(call?.callees[0]?.id).toBe(me.id);
    expect(kinds.slice(1).every((kind) => kind === "emergency")).toBe(true);
    expect(call?.callees.find((row) => row.id === contact.id)).toMatchObject({
      fullNameEn: "Salama Ashoush",
      relationEn: "Brother",
      emergency: true,
    });

    await office.followUp.logContact({
      studentId: me.id,
      date,
      outcome: "reached",
      note: "Back tomorrow.",
    });
    expect(
      (await office.followUp.day({ date })).followUp.calls.find(
        (row) => row.studentId === me.id,
      )?.contacts,
    ).toEqual([
      expect.objectContaining({ outcome: "reached", note: "Back tomorrow." }),
    ]);

    const teacher = await signedIn("lanternfield", login("teacher", academy));
    expect(await rejection(teacher.followUp.day({ date }))).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await rejection(learner.api.followUp.day({ date }))).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("a school with families offers the guardians it permits, the learner from the deciding age, and never a restricted guardian", async () => {
    const office = await signedIn("northwind", login("principal"));
    const student = await sessionFor("northwind", login("student", 0, 1));
    const me = await student.api.identity.currentUser();
    // The other suites that take registers use the seven school days before it.
    const date = schoolDayBack(runDay(me.today), 8);
    const { rows } = await office.attendance.board({ date });
    const registers = await Promise.all(
      rows
        .filter((row) => row.daily)
        .map((row) =>
          office.attendance.register({
            classId: row.classId,
            date,
            periodId: row.periodId,
          }),
        ),
    );
    const homeroom = registers.find((register) =>
      register.students.some((row) => row.id === me.id),
    );
    if (!homeroom) throw new Error("the seeded student has no homeroom");
    await office.attendance.save({
      classId: homeroom.class.id,
      date,
      periodId: periodOf(homeroom).id,
      expectedVersion: homeroom.register?.version ?? 0,
      marks: homeroom.students.map((row) => ({
        studentId: row.id,
        meaning: row.id === me.id ? ("absent" as const) : ("present" as const),
      })),
    });
    const callees = async () =>
      (await office.followUp.day({ date })).followUp.calls.find(
        (row) => row.studentId === me.id,
      )?.callees ?? [];

    const child = await callees();
    expect(child.some((row) => row.kind === "self")).toBe(false);
    const guardians = child.filter((row) => row.kind === "actor");
    const [first] = guardians;
    if (!first) throw new Error("the child has no guardian to call");

    const links = (await office.guardians.custody({ studentId: me.id })).links;
    const link = (
      await office.guardians.ofStudent({ studentId: me.id })
    ).guardians.find((row) => row.userId === first.id);
    const custody = links.find(
      (row) => row.relationshipId === link?.relationshipId,
    );
    if (!link || !custody) throw new Error("the guardian's custody record");
    await office.guardians.saveCustody({
      studentId: me.id,
      relationshipId: link.relationshipId,
      expectedVersion: custody.version,
      contactRestrictions: "No contact by court order.",
      educationalRights: "full",
      communicationIsolated: true,
      pickup: "not_allowed",
    });
    try {
      expect((await callees()).map((row) => row.id)).not.toContain(first.id);
    } finally {
      const restricted = (
        await office.guardians.custody({ studentId: me.id })
      ).links.find((row) => row.relationshipId === link.relationshipId);
      await office.guardians.saveCustody({
        studentId: me.id,
        relationshipId: link.relationshipId,
        expectedVersion: restricted?.version ?? 0,
        contactRestrictions: "",
        educationalRights: "full",
        communicationIsolated: false,
        pickup: "allowed",
      });
    }
    expect((await callees()).map((row) => row.id)).toContain(first.id);

    const born = (await office.people.student({ id: me.id })).birthDate;
    // Who decides is read on the day of the absence.
    const eighteen = addYears(date, -18);
    await setBirthDate(office, me.id, addDays(eighteen, 1));
    try {
      expect((await callees()).some((row) => row.kind === "self")).toBe(false);
      await setAdults(office, true);
      try {
        expect((await callees())[0]).toMatchObject({ kind: "self", id: me.id });
      } finally {
        await setAdults(office, false);
      }
      await setBirthDate(office, me.id, eighteen);
      const adult = await callees();
      expect(adult[0]).toMatchObject({ kind: "self", id: me.id });
      expect(adult.filter((row) => row.kind === "actor").length).toBe(
        guardians.length,
      );
      await withoutModules("northwind", ["families"], async () => {
        expect((await callees()).map((row) => row.kind)).toEqual(["self"]);
      });
    } finally {
      await setBirthDate(office, me.id, born ?? "");
    }
  });
});
