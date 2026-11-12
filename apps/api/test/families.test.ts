import { SEED_PASSWORD } from "@faridalms/database/seed";
import {
  plainContent,
  withFileBlocks,
} from "@faridalms/domain/content-conversion";
import { MODULE_IDS } from "@faridalms/domain/modules";
import { addDays } from "@faridalms/domain/school";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import { names } from "./admission-fixtures";
import {
  client,
  login,
  periodOf,
  raw,
  rejection,
  runDay,
  schoolDayBack,
  seeded,
  sessionFor,
  setPlan,
  signedIn,
  testCell,
} from "./harness";

const principal = () => signedIn("northwind", login("principal"));
// The seeded student's mother signs in with the student's number.
const mother = () =>
  sessionFor("northwind", login("student").replace("student", "parent"));
const pupil = () => sessionFor("northwind", login("student"));

type Office = Awaited<ReturnType<typeof principal>>;

function northwind() {
  const school = seeded().tenants[0]?.schools.find(
    (row) => row.slug === "northwind",
  );
  if (!school) throw new Error("the seed lacks Northwind");
  return school.id;
}

/** Runs a test with these modules off at Northwind, and puts its plan back after. */
async function without(
  off: readonly string[],
  run: () => Promise<void>,
): Promise<void> {
  const schoolId = northwind();
  await setPlan(schoolId, {
    modules: MODULE_IDS.filter((id) => !off.includes(id)),
  });
  try {
    await run();
  } finally {
    await setPlan(schoolId, null);
  }
}

/** What the cell holds, read past every module and every person's reach. */
async function cellCount(query: string, values: unknown[]) {
  const admin = new SQL(testCell().adminUrl);
  try {
    const [row] = (await admin.unsafe(query, values)) as { count: number }[];
    return row?.count ?? 0;
  } finally {
    await admin.close();
  }
}

const suffix = () => crypto.randomUUID().slice(0, 6).toUpperCase();

async function newStudent(office: Office, birthDate = "") {
  const { id } = await office.people.saveStudent({
    names: names("Salama Ashoush", "سلامة عشوش"),
    reference: `FAM-${suffix()}`,
    birthDate,
  });
  return id;
}

async function relationId(office: Office) {
  const relations = await office.guardians.relations();
  const found = relations.find((row) => row.code === "mother") ?? relations[0];
  if (!found) throw new Error("the seed has no relations");
  return found.id;
}

const FULL = {
  legalGuardian: true,
  portalAccess: true,
  receivesNotifications: true,
  primaryContact: true,
  emergencyContact: true,
  residence: "primary" as const,
  pickup: "allowed" as const,
};

describe("a school that turns families off", () => {
  test("a former guardian, with every row left in place, reaches no child, thread, file, notification or search result", async () => {
    const { api, token } = await mother();
    const me = await api.identity.currentUser();
    const learner = await (await pupil()).api.identity.currentUser();
    const child = learner.id;
    const firstName = (learner.nameEn ?? "").split(" ")[0] ?? "";

    // With families on, the mother reaches her child, their thread, a file
    // in it and her notifications.
    expect(
      (await api.guardians.children({ userId: me.id })).map(
        (row) => row.studentId,
      ),
    ).toContain(child);
    expect((await api.home.details({ studentId: child })).studentId).toBe(
      child,
    );
    const thread = (await api.messages.inbox({})).rows.find(
      (row) => row.studentId === child,
    );
    if (!thread) throw new Error("the seed has no family thread for the child");
    const body = new TextEncoder().encode("%PDF-1.4\nA note for school.\n");
    const file = await api.files.initiate({
      purpose: "message_attachment",
      name: "Note.pdf",
      mediaType: "application/pdf",
      sizeBytes: body.byteLength,
    });
    const path = `/v1/files/${file.id}/content`;
    expect(
      (await raw("northwind", token, path, { method: "PUT", body })).status,
    ).toBe(200);
    await api.messages.send({
      threadId: thread.id,
      content: withFileBlocks(plainContent("A note for school."), [file]),
    });
    expect((await raw("northwind", token, path)).status).toBe(200);
    await api.notifications.list({});
    await api.search.find({ q: firstName, kind: "all" });

    await without(["families"], async () => {
      // Nothing is deleted: the link, the thread and its file stay.
      expect(
        await cellCount(
          `select count(*)::int as count from core.user_relationships
           where related_user_id = $1::uuid and student_user_id = $2::uuid and status = 'active'`,
          [me.id, child],
        ),
      ).toBe(1);
      expect(
        await cellCount(
          `select count(*)::int as count from core.thread_members
           where thread_id = $1::uuid and user_id = $2::uuid`,
          [thread.id, me.id],
        ),
      ).toBe(1);

      // The session she held reaches nothing.
      for (const call of [
        () => api.home.details({ studentId: child }),
        () => api.home.followed({ studentId: child }),
        () => api.guardians.children({ userId: me.id }),
        () => api.messages.inbox({}),
        () => api.messages.thread({ id: thread.id }),
        () => api.notifications.list({}),
        () => api.search.find({ q: firstName, kind: "all" }),
        () => api.consents.mine(),
      ])
        expect(await rejection(call())).toMatchObject({ code: "UNAUTHORIZED" });
      expect((await raw("northwind", token, path)).status).not.toBe(200);

      // Nor does she sign in again.
      expect(
        await rejection(
          client("northwind").identity.signIn({
            loginName: login("student").replace("student", "parent"),
            password: SEED_PASSWORD,
          }),
        ),
      ).toMatchObject({ message: "auth.invalid_credentials" });
    });

    // On again, the same rows grant what they did.
    const back = await mother();
    expect(
      (await back.api.guardians.children({ userId: me.id })).map(
        (row) => row.studentId,
      ),
    ).toContain(child);
  });

  test("a member of staff who was a guardian keeps their staff work but reaches the child no more", async () => {
    const office = await principal();
    const staff = await sessionFor("northwind", login("teacher", 0, 3));
    const teacher = await staff.api.identity.currentUser();
    const studentId = await newStudent(office);
    await office.guardians.saveLink({
      studentId,
      existingUserId: teacher.id,
      flags: { ...FULL, relationId: await relationId(office) },
    });
    expect((await staff.api.home.details({ studentId })).studentId).toBe(
      studentId,
    );

    await without(["families"], async () => {
      expect(
        await cellCount(
          `select count(*)::int as count from core.user_relationships
           where related_user_id = $1::uuid and student_user_id = $2::uuid and status = 'active'`,
          [teacher.id, studentId],
        ),
      ).toBe(1);
      expect(
        await rejection(staff.api.home.details({ studentId })),
      ).toMatchObject({ code: "NOT_FOUND" });
      expect(
        await rejection(staff.api.people.student({ id: studentId })),
      ).toMatchObject({ code: "NOT_FOUND" });
      expect(
        (await staff.api.consents.mine()).learners.map((row) => row.studentId),
      ).not.toContain(studentId);
      // Their staff work is untouched.
      expect((await staff.api.home.teacher()).today).toBeDefined();
    });
  });

  test("staff open a guardian's record only through a student they reach, write to none with families off, and the learner reads their own summary", async () => {
    const office = await principal();
    // The seed's second teacher keeps 8A, where the seeded student sits.
    const keeper = await sessionFor("northwind", login("teacher", 0, 1));
    const family = await mother();
    const motherId = (await family.api.identity.currentUser()).id;
    const studentId = await newStudent(office);
    await office.guardians.saveLink({
      studentId,
      person: { names: names("Omar Ashoush", "عمر عشوش"), phone: "" },
      flags: { ...FULL, relationId: await relationId(office) },
    });
    const stranger = (await office.guardians.ofStudent({ studentId }))
      .guardians[0];
    if (!stranger) throw new Error("the new guardian is linked");

    expect((await keeper.api.people.person({ id: motherId })).id).toBe(
      motherId,
    );
    expect(
      await rejection(keeper.api.people.person({ id: stranger.userId })),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      (await keeper.api.messages.recipients({})).rows.some(
        (row) => row.kind === "guardian",
      ),
    ).toBe(true);

    await without(["families"], async () => {
      expect(
        await rejection(keeper.api.people.person({ id: motherId })),
      ).toMatchObject({ code: "NOT_FOUND" });
      expect(
        (await keeper.api.messages.recipients({})).rows.some(
          (row) => row.kind === "guardian" || row.userId === motherId,
        ),
      ).toBe(false);
      expect(
        await rejection(office.guardians.custody({ studentId })),
      ).toMatchObject({ code: "NOT_FOUND" });
      const learner = await pupil();
      const own = (await learner.api.identity.currentUser()).id;
      expect(
        (await learner.api.records.summary({ studentId: own })).permitted,
      ).toBe(true);
    });
  });

  test("the guardians namespace answers not found", async () => {
    const office = await principal();
    await without(["families"], async () => {
      expect(await rejection(office.guardians.relations())).toMatchObject({
        code: "NOT_FOUND",
      });
      expect(
        await rejection(office.familyShares.list({ studentId: northwind() })),
      ).toMatchObject({ code: "NOT_FOUND" });
      expect(await rejection(office.followUp.day({}))).toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});

describe("who a guardian follows", () => {
  test("a link closed to the portal mid-session takes effect on the next request", async () => {
    const office = await principal();
    const { api } = await mother();
    const me = await api.identity.currentUser();
    const child = (await (await pupil()).api.identity.currentUser()).id;
    expect((await api.home.details({ studentId: child })).studentId).toBe(
      child,
    );
    const linkOf = async () => {
      const found = (
        await office.guardians.ofStudent({ studentId: child })
      ).guardians.find((row) => row.userId === me.id);
      if (!found) throw new Error("the mother is linked to her child");
      return found;
    };
    const flagsOf = (link: Awaited<ReturnType<typeof linkOf>>) => ({
      relationId: link.relationId,
      legalGuardian: link.legalGuardian,
      portalAccess: link.portalAccess,
      receivesNotifications: link.receivesNotifications,
      primaryContact: link.primaryContact,
      emergencyContact: link.emergencyContact,
      residence: link.residence,
      pickup: link.pickup,
    });
    const children = await api.guardians.children({ userId: me.id });
    const link = await linkOf();
    await office.guardians.saveLink({
      studentId: child,
      relationshipId: link.relationshipId,
      expectedVersion: link.version,
      flags: { ...flagsOf(link), portalAccess: false },
    });
    try {
      // Following her only child was all that opened her family context.
      expect(
        await rejection(api.home.details({ studentId: child })),
      ).toMatchObject({
        code: children.length === 1 ? "UNAUTHORIZED" : "NOT_FOUND",
      });
    } finally {
      const now = await linkOf();
      await office.guardians.saveLink({
        studentId: child,
        relationshipId: now.relationshipId,
        expectedVersion: now.version,
        flags: flagsOf(link),
      });
    }
    expect((await api.home.details({ studentId: child })).studentId).toBe(
      child,
    );
  });

  test("nothing a request sends widens it", async () => {
    const office = await principal();
    const stranger = await newStudent(office);
    const { api, token } = await mother();
    expect(
      await rejection(api.home.details({ studentId: stranger })),
    ).toMatchObject({ code: "NOT_FOUND" });
    const forged = await seeded().handler(
      new Request("http://api.test/rpc/home/details", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "x-farida-school": "northwind",
          "x-farida-follows": stranger,
        },
        body: JSON.stringify({
          json: { studentId: stranger, follows: [stranger] },
        }),
      }),
    );
    expect(forged.status).toBe(404);
  });
});

describe("brothers and sisters", () => {
  test("are only the students the viewer reaches", async () => {
    const office = await principal();
    const keeper = await sessionFor("northwind", login("teacher", 0, 1));
    const taught = (await (await pupil()).api.identity.currentUser()).id;
    const sibling = await newStudent(office);
    const mum = (await office.guardians.ofStudent({ studentId: taught }))
      .guardians[0];
    if (!mum) throw new Error("the seeded student has a guardian");
    await office.guardians.saveLink({
      studentId: sibling,
      existingUserId: mum.userId,
      flags: { ...FULL, relationId: await relationId(office) },
    });
    expect(
      (await office.guardians.siblings({ id: taught })).map(
        (row) => row.userId,
      ),
    ).toContain(sibling);
    expect(
      (await keeper.api.guardians.siblings({ id: taught })).map(
        (row) => row.userId,
      ),
    ).not.toContain(sibling);
  });
});

/** Marks the seeded student absent from their homeroom on the day, and gives back how to mark them present again. */
async function absentOn(office: Office, studentId: string, date: string) {
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
    register.students.some((row) => row.id === studentId),
  );
  if (!homeroom) throw new Error("the seeded student has no homeroom");
  const marks = (meaning: "absent" | "present") =>
    homeroom.students.map((row) => ({
      studentId: row.id,
      meaning: row.id === studentId ? meaning : ("present" as const),
    }));
  const absent = await office.attendance.save({
    classId: homeroom.class.id,
    date,
    periodId: periodOf(homeroom).id,
    expectedVersion: homeroom.register?.version ?? 0,
    marks: marks("absent"),
  });
  return () =>
    office.attendance.save({
      classId: homeroom.class.id,
      date,
      periodId: periodOf(homeroom).id,
      expectedVersion: absent.version,
      marks: marks("present"),
      correction: "Marked absent by mistake.",
    });
}

/** What the cell holds of a person's absence notice about the student on the day: in the app, and queued by email or text. */
async function told(userId: string, studentId: string, date: string) {
  const values = [userId, studentId, date];
  return {
    inApp: await cellCount(
      `select count(*)::int as count from core.notifications
       where user_id = $1::uuid and kind = 'absence' and subject_id = $2::uuid
         and params->>'date' = $3`,
      values,
    ),
    queued: await cellCount(
      `select count(*)::int as count from core.notification_deliveries d
       join core.notifications n on n.tenant_id = d.tenant_id and n.id = d.notification_id
       where d.user_id = $1::uuid and n.kind = 'absence' and n.subject_id = $2::uuid
         and n.params->>'date' = $3 and d.channel in ('email', 'sms')`,
      values,
    ),
  };
}

describe("absence notices", () => {
  test("with families off and the links in place, an unexplained absence reaches the learner who decides for themself and no former guardian", async () => {
    const office = await principal();
    const learner = await pupil();
    const me = await learner.api.identity.currentUser();
    const { today } = await office.attendance.day({});
    // The sixth school day back: the register, notice, report and follow-up
    // suites take the five after it.
    const date = schoolDayBack(runDay(today), 6);
    const guardians = (await office.guardians.ofStudent({ studentId: me.id }))
      .guardians;
    expect(guardians.length).toBeGreaterThan(0);
    const before = await office.people.student({ id: me.id });
    const profile = await office.school.profile();
    const birthDate = async (value: string) => {
      const current = await office.people.student({ id: me.id });
      await office.people.saveStudent({
        id: me.id,
        expectedVersion: current.version,
        names: names(current.fullNameEn ?? "", current.fullNameAr ?? ""),
        reference: current.reference ?? "",
        birthDate: value,
      });
    };
    await birthDate(
      `${Number(today.slice(0, 4)) - profile.learnersDecideFrom - 1}${today.slice(4)}`,
    );
    try {
      await without(["families"], async () => {
        const present = await absentOn(office, me.id, date);
        try {
          expect((await told(me.id, me.id, date)).inApp).toBe(1);
          for (const guardian of guardians) {
            expect(
              await cellCount(
                `select count(*)::int as count from core.user_relationships
                 where id = $1::uuid and status = 'active'`,
                [guardian.relationshipId],
              ),
            ).toBe(1);
            expect(await told(guardian.userId, me.id, date)).toEqual({
              inApp: 0,
              queued: 0,
            });
          }
        } finally {
          await present();
        }
      });
    } finally {
      await birthDate(before.birthDate ?? "");
    }
  });

  test("with families on, an unexplained absence reaches a guardian the school tells and not one it cut off", async () => {
    const office = await principal();
    const me = await (await pupil()).api.identity.currentUser();
    const { today } = await office.attendance.day({});
    // The seventh school day back, after the day the test above takes.
    const date = schoolDayBack(runDay(today), 7);
    const linkOf = async (meaning: string) => {
      const found = (
        await office.guardians.ofStudent({ studentId: me.id })
      ).guardians.find((row) => row.relationMeaning === meaning);
      if (!found) throw new Error(`the seeded student has no ${meaning}`);
      return found;
    };
    const mum = await linkOf("mother");
    const original = await linkOf("father");
    const flagsOf = (link: typeof original) => ({
      relationId: link.relationId,
      legalGuardian: link.legalGuardian,
      portalAccess: link.portalAccess,
      receivesNotifications: link.receivesNotifications,
      primaryContact: link.primaryContact,
      emergencyContact: link.emergencyContact,
      residence: link.residence,
      pickup: link.pickup,
    });
    // He takes the school's notices, so only the restriction keeps this one from him.
    await office.guardians.saveLink({
      studentId: me.id,
      relationshipId: original.relationshipId,
      expectedVersion: original.version,
      flags: { ...flagsOf(original), receivesNotifications: true },
    });
    const father = await linkOf("father");
    const custody = (
      await office.guardians.custody({ studentId: me.id })
    ).links.find((row) => row.relationshipId === father.relationshipId);
    if (!custody) throw new Error("the father's custody record");
    const restore = {
      contactRestrictions: custody.contactRestrictions ?? "",
      educationalRights: custody.educationalRights,
      communicationIsolated: custody.communicationIsolated,
      pickup: custody.pickup,
    };
    await office.guardians.saveCustody({
      studentId: me.id,
      relationshipId: father.relationshipId,
      expectedVersion: father.version,
      ...restore,
      communicationIsolated: true,
    });
    try {
      const present = await absentOn(office, me.id, date);
      try {
        expect((await told(mum.userId, me.id, date)).inApp).toBe(1);
        expect(await told(father.userId, me.id, date)).toEqual({
          inApp: 0,
          queued: 0,
        });
      } finally {
        await present();
      }
    } finally {
      await office.guardians.saveCustody({
        studentId: me.id,
        relationshipId: father.relationshipId,
        expectedVersion: (await linkOf("father")).version,
        ...restore,
      });
      await office.guardians.saveLink({
        studentId: me.id,
        relationshipId: original.relationshipId,
        expectedVersion: (await linkOf("father")).version,
        flags: flagsOf(original),
      });
    }
  });
});

describe("learners who decide for themselves", () => {
  test("from the school's age on the birthday, and not the day before; with no birth date, not at all", async () => {
    const office = await principal();
    const learner = await pupil();
    const me = await learner.api.identity.currentUser();
    const before = await office.people.student({ id: me.id });
    const today = before.today;
    const profile = await office.school.profile();
    const answers = async (birthDate: string) => {
      const current = await office.people.student({ id: me.id });
      await office.people.saveStudent({
        id: me.id,
        expectedVersion: current.version,
        names: names(current.fullNameEn ?? "", current.fullNameAr ?? ""),
        reference: current.reference ?? "",
        birthDate,
      });
      const mine = await learner.api.consents.mine();
      return mine.learners.find((row) => row.studentId === me.id)?.mayAnswer;
    };
    const eighteen = (day: string) =>
      `${Number(day.slice(0, 4)) - profile.learnersDecideFrom}${day.slice(4)}`;
    try {
      expect(await answers(eighteen(today))).toBe(true);
      expect(await answers(eighteen(addDays(today, 1)))).toBe(false);
      expect(await answers("")).toBe(false);
      // A guardian of a learner of age still answers too.
      await answers(eighteen(today));
      const family = await mother();
      expect(
        (await family.api.consents.mine()).learners.find(
          (row) => row.studentId === me.id,
        )?.mayAnswer,
      ).toBe(true);
    } finally {
      const current = await office.people.student({ id: me.id });
      await office.people.saveStudent({
        id: me.id,
        expectedVersion: current.version,
        names: names(current.fullNameEn ?? "", current.fullNameAr ?? ""),
        reference: current.reference ?? "",
        birthDate: before.birthDate ?? "",
      });
    }
  });
});

describe("collecting a child", () => {
  test("a contact barred from collecting is refused, and with families off nobody is admitted by a link", async () => {
    const office = await principal();
    const studentId = await newStudent(office);
    await office.guardians.saveLink({
      studentId,
      person: { names: names("Omar Ashoush", "عمر عشوش"), phone: "" },
      flags: {
        ...FULL,
        relationId: await relationId(office),
        pickup: "not_allowed",
      },
    });
    const contacts = await office.frontDesk.pickup({ studentId });
    const barred = contacts.find((row) => row.pickup === "not_allowed");
    if (!barred) throw new Error("the barred contact is listed");
    await office.frontDesk.signIn({ studentId, at: "08:00" });
    expect(
      await rejection(
        office.frontDesk.signOut({
          studentId,
          at: "10:00",
          collectedById: barred.userId,
        }),
      ),
    ).toMatchObject({
      code: "FORBIDDEN",
      message: "attendance.pickup_not_allowed",
    });

    await without(["families"], async () => {
      expect(await office.frontDesk.pickup({ studentId })).toEqual([]);
      expect(
        await rejection(
          office.frontDesk.signOut({
            studentId,
            at: "10:00",
            collectedById: barred.userId,
          }),
        ),
      ).toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
