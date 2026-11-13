import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import { names } from "./admission-fixtures";
import {
  login,
  rejection,
  seeded,
  sessionFor,
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

const academy = () => tenantOf("lanternfield");
const academyLogin = (role: string, index = 0) => login(role, academy(), index);
const academyOffice = () =>
  signedIn("lanternfield", academyLogin("site_administrator"));
const academyLearner = (index = 0) =>
  sessionFor("lanternfield", academyLogin("student", index));

const principal = () => signedIn("northwind", login("principal"));
const pupil = () => sessionFor("northwind", login("student"));
const mother = () =>
  sessionFor("northwind", login("student").replace("student", "parent"));

async function auditCount(action: string, objectId: string) {
  const admin = new SQL(testCell().adminUrl);
  try {
    const [row] = (await admin.unsafe(
      `select count(*)::int as count from audit.log
       where action = $1 and object_id = $2::uuid and actor_user_id is not null
         and occurred_at is not null`,
      [action, objectId],
    )) as { count: number }[];
    return row?.count ?? 0;
  } finally {
    await admin.close();
  }
}

/** Saves the school's settings as they are, with the adults setting as given. */
async function setAdults(office: Api, adults: boolean) {
  const profile = await office.school.profile();
  await office.school.saveProfile({
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
  return profile.learnersAreAdults;
}

async function setBirthDate(office: Api, studentId: string, birthDate: string) {
  const current = await office.people.student({ id: studentId });
  await office.people.saveStudent({
    id: studentId,
    expectedVersion: current.version,
    names: names(current.fullNameEn ?? "", current.fullNameAr ?? ""),
    reference: current.reference ?? "",
    birthDate,
  });
  return current.birthDate ?? "";
}

describe("a learner's own emergency contacts at a school without families", () => {
  test("the learner reads and changes their own, in the school's history with who changed them", async () => {
    const learner = await academyLearner();
    const me = await learner.api.identity.currentUser();
    const seededList = await learner.api.people.emergencyContacts({
      personId: me.id,
    });
    expect(seededList.edits).toBe(true);
    expect(seededList.contacts.length).toBeGreaterThan(0);
    expect(seededList.contacts.every((contact) => contact.own)).toBe(true);

    const added = await learner.api.people.saveEmergencyContact({
      personId: me.id,
      name: "Salama Ashoush",
      relationship: "Brother",
      phone: "0100 000 0081",
      otherPhone: "+44 20 7946 0000",
      email: "Salama@Example.com",
      callOrder: 1,
      notes: "Call after six.",
    });
    try {
      const listed = (
        await learner.api.people.emergencyContacts({ personId: me.id })
      ).contacts.find((contact) => contact.id === added.id);
      expect(listed).toMatchObject({
        own: true,
        fullNameEn: "Salama Ashoush",
        relation: { labelEn: "Brother", labelAr: "Brother" },
        phone: "+201000000081",
        otherPhone: "+442079460000",
        email: "salama@example.com",
        notes: "Call after six.",
        order: 1,
      });
      expect(await auditCount("emergency_contact.create", added.id)).toBe(1);

      expect(
        await rejection(
          learner.api.people.saveEmergencyContact({
            personId: me.id,
            id: added.id,
            expectedVersion: added.version,
            name: "Salama Ashoush",
            phone: "not a phone",
            callOrder: 2,
          }),
        ),
      ).toMatchObject({
        code: "BAD_REQUEST",
        message: "contact_point.phone_invalid",
      });

      const changed = await learner.api.people.saveEmergencyContact({
        personId: me.id,
        id: added.id,
        expectedVersion: added.version,
        name: "Salama Ashoush",
        relationship: "Brother",
        phone: "0100 000 0082",
        callOrder: 2,
      });
      expect(
        await rejection(
          learner.api.people.saveEmergencyContact({
            personId: me.id,
            id: added.id,
            expectedVersion: added.version,
            name: "Stale",
            phone: "0100 000 0083",
            callOrder: 2,
          }),
        ),
      ).toMatchObject({ code: "CONFLICT" });

      const office = await academyOffice();
      const history = await office.people.studentHistory({ id: me.id });
      const update = history.rows.find(
        (entry) => entry.action === "emergency_contact.update",
      );
      expect(update?.changes).toEqual(
        expect.arrayContaining([
          {
            field: "core.emergency_contacts.phone",
            kind: "phone",
            before: "+201000000081",
            after: "+201000000082",
          },
          {
            field: "core.emergency_contacts.call_order",
            kind: "count",
            before: 1,
            after: 2,
          },
        ]),
      );
      expect(update?.actorNameEn).toBe(
        (await office.people.student({ id: me.id })).fullNameEn,
      );

      await learner.api.people.removeEmergencyContact({
        personId: me.id,
        id: added.id,
        expectedVersion: changed.version,
      });
      expect(
        (
          await learner.api.people.emergencyContacts({ personId: me.id })
        ).contacts.some((contact) => contact.id === added.id),
      ).toBe(false);
      expect(await auditCount("emergency_contact.remove", added.id)).toBe(1);
    } finally {
      const left = (
        await learner.api.people.emergencyContacts({ personId: me.id })
      ).contacts.find((contact) => contact.id === added.id);
      if (left?.version)
        await learner.api.people.removeEmergencyContact({
          personId: me.id,
          id: added.id,
          expectedVersion: left.version,
        });
    }
  });

  test("a teacher reads them and cannot change them; another learner reaches none", async () => {
    const office = await academyOffice();
    const me = await (await academyLearner()).api.identity.currentUser();
    const teacher = await signedIn("lanternfield", academyLogin("teacher"));
    const read = await teacher.people.emergencyContacts({ personId: me.id });
    expect(read.edits).toBe(false);
    expect(read.contacts.length).toBeGreaterThan(0);
    expect(
      await rejection(
        teacher.people.saveEmergencyContact({
          personId: me.id,
          name: "Salama Ashoush",
          phone: "0100 000 0084",
          callOrder: 3,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });

    const other = await academyLearner(1);
    expect(
      await rejection(other.api.people.emergencyContacts({ personId: me.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await rejection(
        other.api.people.saveEmergencyContact({
          personId: me.id,
          name: "Salama Ashoush",
          phone: "0100 000 0085",
          callOrder: 3,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    expect(
      (await office.people.emergencyContacts({ personId: me.id })).edits,
    ).toBe(true);
  });
});

describe("a school of adults", () => {
  test("only those who keep the school's settings state it, and the statement is audited", async () => {
    const office = await academyOffice();
    const teacher = await signedIn("lanternfield", academyLogin("teacher"));
    const profile = await office.school.profile();
    expect(profile.learnersAreAdults).toBe(true);
    expect(
      await rejection(
        teacher.school.saveProfile({
          expectedVersion: profile.version,
          nameEn: profile.nameEn ?? "",
          nameAr: profile.nameAr ?? "",
          identifier: profile.identifier ?? "",
          timeZone: profile.timeZone ?? "Africa/Cairo",
          defaultLocale: profile.defaultLocale,
          weekStart: profile.weekStart,
          weekendDays: profile.weekendDays,
          learnersAreAdults: false,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    const before = await auditCount("school.update", profile.id);
    await setAdults(office, false);
    try {
      expect((await office.school.profile()).learnersAreAdults).toBe(false);
      expect(await auditCount("school.update", profile.id)).toBe(before + 1);
    } finally {
      await setAdults(office, true);
    }
  });

  test("lets every learner decide for themself without a birth date, and the age rule holds again once it is off", async () => {
    const office = await academyOffice();
    const learner = await academyLearner(2);
    const me = await learner.api.identity.currentUser();
    const born = await setBirthDate(office, me.id, "");
    const decides = async () => ({
      details: (await learner.api.home.details({ studentId: me.id })).decides,
      contacts: (
        await learner.api.people.emergencyContacts({ personId: me.id })
      ).edits,
    });
    try {
      expect(await decides()).toEqual({ details: true, contacts: true });
      await setAdults(office, false);
      try {
        expect(await decides()).toEqual({ details: false, contacts: false });
        expect(
          await rejection(
            learner.api.people.saveEmergencyContact({
              personId: me.id,
              name: "Salama Ashoush",
              phone: "0100 000 0086",
              callOrder: 3,
            }),
          ),
        ).toMatchObject({
          code: "FORBIDDEN",
          message: "emergency_contacts.not_permitted",
        });
        await setBirthDate(office, me.id, born);
        expect(await decides()).toEqual({ details: true, contacts: true });
      } finally {
        await setAdults(office, true);
      }
    } finally {
      await setBirthDate(office, me.id, born);
    }
  });

  test("at a school with families, a guardian keeps their rights and the learner gains their own", async () => {
    const office = await principal();
    const learner = await pupil();
    const family = await mother();
    const me = await learner.api.identity.currentUser();
    const consentsOf = async (who: { api: Api }) =>
      (await who.api.consents.mine()).learners.find(
        (row) => row.studentId === me.id,
      )?.mayAnswer;
    const before = {
      learner: await consentsOf(learner),
      guardian: await consentsOf(family),
      guardianEdits: (
        await family.api.people.emergencyContacts({ personId: me.id })
      ).edits,
    };
    expect(before).toEqual({
      learner: false,
      guardian: true,
      guardianEdits: true,
    });
    const was = await setAdults(office, true);
    try {
      expect(await consentsOf(learner)).toBe(true);
      expect(await consentsOf(family)).toBe(true);
      expect(
        (await family.api.people.emergencyContacts({ personId: me.id })).edits,
      ).toBe(true);
      expect(
        (await learner.api.people.emergencyContacts({ personId: me.id })).edits,
      ).toBe(true);
    } finally {
      await setAdults(office, was);
    }
    expect(
      (await learner.api.people.emergencyContacts({ personId: me.id })).edits,
    ).toBe(false);
  });
});

describe("one list with families on", () => {
  test("the guardians marked for emergencies and the learner's own, in calling order, and the guardians alone go with families", async () => {
    const office = await principal();
    const me = await (await pupil()).api.identity.currentUser();
    const marked = (
      await office.guardians.ofStudent({ studentId: me.id })
    ).guardians
      .filter((link) => link.emergencyContact)
      .toSorted(
        (a, b) => (a.contactPriority ?? 99) - (b.contactPriority ?? 99),
      );
    expect(marked.length).toBeGreaterThan(0);
    const before = await office.people.emergencyContacts({ personId: me.id });
    expect(before.contacts.map((contact) => contact.id)).toEqual(
      marked.map((link) => link.relationshipId),
    );
    expect(before.contacts.every((contact) => !contact.own)).toBe(true);

    const own = await office.people.saveEmergencyContact({
      personId: me.id,
      name: "Salama Ashoush",
      relationship: "Uncle",
      phone: "0100 000 0087",
      callOrder: 99,
    });
    try {
      const listed = await office.people.emergencyContacts({
        personId: me.id,
      });
      expect(listed.contacts.map((contact) => contact.id)).toEqual([
        ...marked.map((link) => link.relationshipId),
        own.id,
      ]);

      const family = await mother();
      const summary = await family.api.records.summary({ studentId: me.id });
      if (!summary.permitted) throw new Error("the mother reads the summary");
      expect(
        summary.contacts.map((contact) => [contact.id, contact.askable]),
      ).toEqual([
        ...marked.map((link) => [link.relationshipId, true]),
        [own.id, false],
      ]);
      expect(
        await rejection(
          family.api.records.askChange({
            target: "contact",
            studentId: me.id,
            contactId: own.id,
            phone: "0100 000 0088",
          }),
        ),
      ).toMatchObject({ code: "NOT_FOUND" });

      await withoutModules("northwind", ["families"], async () => {
        const alone = await office.people.emergencyContacts({
          personId: me.id,
        });
        expect(alone.contacts.map((contact) => contact.id)).toEqual([own.id]);
      });
    } finally {
      await office.people.removeEmergencyContact({
        personId: me.id,
        id: own.id,
        expectedVersion: own.version,
      });
    }
  });

  test("a learner below the deciding age reads their own and changes nothing", async () => {
    const learner = await pupil();
    const me = await learner.api.identity.currentUser();
    const read = await learner.api.people.emergencyContacts({
      personId: me.id,
    });
    expect(read.edits).toBe(false);
    expect(
      await rejection(
        learner.api.people.saveEmergencyContact({
          personId: me.id,
          name: "Salama Ashoush",
          phone: "0100 000 0089",
          callOrder: 1,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
