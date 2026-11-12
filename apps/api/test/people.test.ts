import { plainContent } from "@faridalms/domain/content-conversion";
import { shownContacts } from "@faridalms/domain/people";
import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";

import {
  client,
  login,
  raw,
  rejection,
  seeded,
  sessionFor,
  signedIn,
} from "./harness";

const names = (en: string, ar: string) => ({
  en: { given: en.split(" ")[0], family: en.split(" ").slice(1).join(" ") },
  ar: { given: ar.split(" ")[0], family: ar.split(" ").slice(1).join(" ") },
});

describe("students", () => {
  test("the principal lists the school's students for the working year", async () => {
    const api = await signedIn("northwind", login("principal"));
    const list = await api.people.students({});
    expect(list.total).toBe(18);
    expect(list.rows.every((row) => row.status === "enrolled")).toBe(true);
    expect(list.rows[0]?.columns.grade).toBeTruthy();
    expect(list.rows.every((row) => row.reference?.startsWith("NO"))).toBe(
      true,
    );
  });

  test("a year the school does not have is refused, not swapped for the working year", async () => {
    const api = await signedIn("northwind", login("principal"));
    expect(
      await rejection(
        api.people.students({
          views: { year: "01a1aa00-0000-7000-8000-000000000000" },
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("search finds a student by either script, by reference and by a guardian's phone", async () => {
    const api = await signedIn("northwind", login("principal"));
    const [first] = (await api.people.students({ pageSize: 25 })).rows;
    if (!first?.fullNameEn || !first.fullNameAr || !first.reference)
      throw new Error("seed");
    for (const q of [first.fullNameEn, first.fullNameAr, first.reference]) {
      const found = await api.people.students({ q });
      expect(found.rows.map((row) => row.id)).toContain(first.id);
    }
    const phone = first.columns.guardian;
    if (phone?.startsWith("+")) {
      const byPhone = await api.people.students({
        q: phone.replace("+20", "0"),
      });
      expect(byPhone.rows.map((row) => row.id)).toContain(first.id);
    }
  });

  test("a teacher reaches the students of the classes they teach, and no others", async () => {
    const principal = await signedIn("northwind", login("principal"));
    const everyone = (await principal.people.students({ pageSize: 50 })).rows;
    const teacher = await signedIn("northwind", login("teacher"));
    const mine = await teacher.people.students({ pageSize: 50 });
    expect(mine.total).toBeGreaterThan(0);
    expect(mine.total).toBeLessThan(everyone.length);
    const taught = new Set(mine.rows.map((row) => row.id));
    const other = everyone.find((row) => !taught.has(row.id));
    if (!other) throw new Error("seed student outside the teacher's classes");
    expect(
      await rejection(teacher.people.student({ id: other.id })),
    ).toMatchObject({
      code: "NOT_FOUND",
    });
    const own = mine.rows[0];
    if (!own) throw new Error("seed taught student");
    expect((await teacher.people.student({ id: own.id })).id).toBe(own.id);
  });

  test("a family session cannot run the directory", async () => {
    const parent = await signedIn("northwind", login("parent"));
    expect(await rejection(parent.people.students({}))).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("another school of the same tenant does not show this school's students", async () => {
    const northwind = await signedIn("northwind", login("principal"));
    const [first] = (await northwind.people.students({})).rows;
    const east = await signedIn("northwind-east", login("principal", 0, 1));
    expect(
      await rejection(east.people.student({ id: first?.id ?? "" })),
    ).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("adding a student gives them a grade, links a new guardian and makes the guardian a parent", async () => {
    const api = await signedIn("northwind", login("principal"));
    const options = {
      ...(await api.people.options()),
      relations: await api.guardians.relations(),
    };
    const grade = (await api.gradeLevels.options()).grades.find(
      (row) => row.code === "grade_7",
    );
    const mother = options.relations.find((row) => row.code === "mother");
    if (!grade || !mother) throw new Error("options");
    const created = await api.people.saveStudent({
      names: names("Laila Ashoush", "ليلى عشوش"),
      reference: "NO9001",
      birthDate: "2014-03-02",
      parts: {
        grade: { gradeId: grade.id },
        families: [
          {
            person: {
              names: names("Heba Ashoush", "هبة عشوش"),
              phone: "0100 555 0101",
            },
            flags: {
              relationId: mother.id,
              legalGuardian: true,
              portalAccess: true,
              receivesNotifications: true,
              primaryContact: true,
              emergencyContact: true,
              residence: "primary",
              pickup: "allowed",
            },
          },
        ],
      },
    });
    const record = await api.people.student({ id: created.id });
    expect(record.reference).toBe("NO9001");
    expect(record.status).toBe("enrolled");
    const grades = await api.gradeLevels.student({ studentId: created.id });
    expect(grades.rows.map((row) => row.grade?.id)).toEqual([grade.id]);
    // In no class and so in no year yet, they are still on the default list.
    expect(
      (await api.people.students({ q: "NO9001" })).rows.map((row) => [
        row.id,
        row.status,
        row.columns.grade,
      ]),
    ).toEqual([[created.id, "unplaced", grade.id]]);
    expect(
      (await api.guardians.ofStudent({ studentId: created.id })).guardians[0]
        ?.contacts[0]?.normalized,
    ).toBe("+201005550101");
    const { rows: history } = await api.people.studentHistory({
      id: created.id,
    });
    expect(history.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "user.create",
        "student_grade.change",
        "relationship.create",
      ]),
    );
    const found = await api.people.findByContact({ phone: "+20 100 555 0101" });
    expect(found).toHaveLength(1);
    const matches = await api.people.matches({
      names: names("Laila Ashoush", "ليلى عشوش"),
      birthDate: "2014-03-02",
    });
    expect(matches.map((match) => match.id)).toContain(created.id);
  });

  test("a student's history shows the old and new value of each field an edit changed", async () => {
    const api = await signedIn("northwind", login("principal"));
    const options = {
      ...(await api.people.options()),
      relations: await api.guardians.relations(),
    };
    const mother = options.relations.find((row) => row.code === "mother");
    if (!mother) throw new Error("options");
    const flags = {
      relationId: mother.id,
      legalGuardian: true,
      portalAccess: false,
      receivesNotifications: true,
      primaryContact: true,
      emergencyContact: true,
      residence: "primary" as const,
      pickup: "allowed" as const,
    };
    const reference = `NO${crypto.randomUUID().slice(0, 6)}`;
    const { id } = await api.people.saveStudent({
      names: names("Salama Ashoush", "سلامة عشوش"),
      reference,
      birthDate: "2015-04-01",
      parts: {
        families: [
          {
            person: { names: names("Mona Ashoush", "منى عشوش"), phone: "" },
            flags,
          },
        ],
      },
    });
    const record = await api.people.student({ id });
    await api.people.saveStudent({
      id,
      expectedVersion: record.version,
      names: names("Salam Ashoush", "سلامة عشوش"),
      reference,
      birthDate: "2015-04-02",
    });
    const link = (await api.guardians.ofStudent({ studentId: id }))
      .guardians[0];
    if (!link) throw new Error("no guardian");
    await api.guardians.saveLink({
      studentId: id,
      relationshipId: link.relationshipId,
      expectedVersion: link.version,
      flags: { ...flags, portalAccess: true, pickup: "ask_office" },
    });

    const { rows } = await api.people.studentHistory({ id });
    const changesOf = (action: string) =>
      rows.find((row) => row.action === action)?.changes;
    expect(changesOf("user.update")).toEqual([
      {
        field: "core.users.given_name_en",
        kind: "text",
        before: "Salama",
        after: "Salam",
      },
      {
        field: "core.users.birth_date",
        kind: "date",
        before: "2015-04-01",
        after: "2015-04-02",
      },
    ]);
    expect(changesOf("relationship.update")).toEqual([
      {
        field: "core.user_relationships.portal_access",
        kind: "boolean",
        before: false,
        after: true,
      },
      {
        field: "core.user_relationships.pickup",
        kind: "choice",
        before: "allowed",
        after: "ask_office",
      },
    ]);
    expect(changesOf("user.create")).toEqual([]);
    // The English full name changed too, but only the parts are shown.
    expect(rows.find((row) => row.action === "user.update")?.changed).toContain(
      "full_name_en",
    );
  });

  test("a reference is unique within the school", async () => {
    const api = await signedIn("northwind", login("principal"));
    const [first] = (await api.people.students({})).rows;
    expect(
      await rejection(
        api.people.saveStudent({
          names: names("Omar Duplicate", "عمر مكرر"),
          reference: first?.reference ?? "",
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "student.reference_taken" });
  });

  test("editing names on a stale version is refused", async () => {
    const api = await signedIn("northwind", login("principal"));
    const [first] = (await api.people.students({})).rows;
    const record = await api.people.student({ id: first?.id ?? "" });
    const input = {
      id: record.id,
      expectedVersion: record.version,
      names: names("Renamed Student", "طالب جديد"),
      reference: record.reference ?? "",
    };
    await api.people.saveStudent(input);
    expect(await rejection(api.people.saveStudent(input))).toMatchObject({
      message: "conflict.version",
    });
  });

  test("ending a guardian link removes their family role when nothing else supports it", async () => {
    const api = await signedIn("northwind", login("principal"));
    const list = await api.people.students({ q: "NO1002" });
    const student = await api.people.student({ id: list.rows[0]?.id ?? "" });
    const father = (
      await api.guardians.ofStudent({ studentId: list.rows[0]?.id ?? "" })
    ).guardians.find((g) => g.relationMeaning === "father");
    if (!father) throw new Error("seed father");
    await api.guardians.endLink({
      relationshipId: father.relationshipId,
      expectedVersion: father.version,
    });
    const after = await api.people.student({ id: student.id });
    expect(
      (await api.guardians.ofStudent({ studentId: after.id })).guardians.some(
        (g) => g.relationshipId === father.relationshipId,
      ),
    ).toBe(false);
    const unauthenticated = client("northwind");
    expect(await rejection(unauthenticated.people.students({}))).toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("how a student joined, and the school they came from, are kept on their first placement", async () => {
    const api = await signedIn("northwind", login("principal"));
    const transfer = (await api.years.options()).entryTypes.find(
      (row) => row.code === "transfer_in",
    );
    const [inYear] = (await api.classes.directory({})).rows;
    if (!transfer || !inYear) throw new Error("options");
    const { id: studentId } = await api.people.saveStudent({
      names: names("Salama Ashoush", "سلامة عشوش"),
      reference: "NO9731",
    });
    // Joining a class of the working year places a student in the year.
    await api.classes.enrol({ studentId, classId: inYear.id });
    const firstPlacement = async () =>
      (await api.years.placementsOf({ studentId })).placements[0];
    const placement = await firstPlacement();
    if (!placement) throw new Error("the student was not placed");
    expect(placement).toMatchObject({
      entryTypeId: null,
      previousSchool: null,
    });

    const arrival = { studentId, placementId: placement.id };
    await api.years.saveArrival({
      ...arrival,
      entryTypeId: transfer.id,
      previousSchool: "  Nile Valley School ",
    });
    expect(await firstPlacement()).toMatchObject({
      entryTypeId: transfer.id,
      previousSchool: "Nile Valley School",
    });
    // Cleared again, both read as not recorded.
    await api.years.saveArrival({
      ...arrival,
      entryTypeId: "",
      previousSchool: "",
    });
    expect(await firstPlacement()).toMatchObject({
      entryTypeId: null,
      previousSchool: null,
    });

    expect(
      await rejection(
        api.years.saveArrival({
          ...arrival,
          placementId: crypto.randomUUID(),
          entryTypeId: transfer.id,
          previousSchool: "",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await rejection(
        api.years.saveArrival({
          ...arrival,
          entryTypeId: crypto.randomUUID(),
          previousSchool: "",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.years.saveArrival({
          ...arrival,
          entryTypeId: "",
          previousSchool: "",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("person records", () => {
  test("the principal opens a guardian with contacts, roles and linked students", async () => {
    const api = await signedIn("northwind", login("principal"));
    const list = await api.people.students({ q: "NO1003" });
    const guardian = (
      await api.guardians.ofStudent({ studentId: list.rows[0]?.id ?? "" })
    ).guardians[0];
    if (!guardian) throw new Error("seed guardian");
    const record = await api.people.person({ id: guardian.userId });
    expect(
      record.roles.some(
        (role) => role.role === "parent" || role.role === "guardian",
      ),
    ).toBe(true);
    expect(record.contacts?.length).toBeGreaterThan(0);
    const child = (
      await api.guardians.children({ userId: guardian.userId })
    ).find((entry) => entry.studentId === list.rows[0]?.id);
    expect(child?.relation?.labelAr).toBeTruthy();
    expect(record.access).toMatchObject({
      self: false,
      manage: true,
      history: true,
    });
    const { rows: history } = await api.people.personHistory({
      id: guardian.userId,
    });
    expect(Array.isArray(history)).toBe(true);
  });

  test("a parent opens their own record but not another family's", async () => {
    const parent = await signedIn("northwind", login("parent"));
    const me = await parent.identity.currentUser();
    const own = await parent.people.person({ id: me.id });
    expect(own.access).toMatchObject({
      self: true,
      manage: false,
      history: false,
    });
    expect(own.account?.state).toBe("active");
    expect(
      (await parent.guardians.children({ userId: me.id })).length,
    ).toBeGreaterThan(0);
    expect(
      await rejection(parent.people.personHistory({ id: me.id })),
    ).toMatchObject({
      code: "FORBIDDEN",
    });
    const other = await signedIn("northwind", login("parent", 0, 1));
    const otherId = (await other.identity.currentUser()).id;
    expect(
      await rejection(parent.people.person({ id: otherId })),
    ).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("a teacher sees a colleague's roles but not their phone or birth date", async () => {
    const principal = await signedIn("northwind", login("principal"));
    const principalId = (await principal.identity.currentUser()).id;
    const teacher = await signedIn("northwind", login("teacher"));
    const record = await teacher.people.person({ id: principalId });
    expect(record.roles.map((role) => role.role)).toContain("principal");
    expect(record.birthDate).toBeNull();
    expect(record.account).toBeNull();
  });
});

describe("staff", () => {
  test("the directory lists the school's staff and the group's administrators", async () => {
    const api = await signedIn("northwind", login("principal"));
    const list = await api.people.staff({});
    const roles = list.rows.flatMap((row) => row.roles);
    expect(roles).toContain("principal");
    expect(roles).toContain("teacher");
    expect(roles).toContain("district_administrator");
    expect(
      list.rows.filter((row) => row.roles.includes("teacher")).length,
    ).toBeGreaterThanOrEqual(6);
    expect(list.rows.every((row) => row.account !== null)).toBe(true);
    const teachers = await api.people.staff({ role: ["teacher"] });
    expect(teachers.rows.every((row) => row.roles.includes("teacher"))).toBe(
      true,
    );
  });

  test("a teacher reads colleagues without sign-in details and opens the group administrator", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    const list = await teacher.people.staff({});
    expect(list.manage).toBe(false);
    expect(list.rows.every((row) => row.account === null)).toBe(true);
    const admin = list.rows.find((row) =>
      row.roles.includes("district_administrator"),
    );
    if (!admin) throw new Error("seed group administrator");
    const record = await teacher.people.person({ id: admin.id });
    expect(record.roles.map((role) => role.role)).toContain(
      "district_administrator",
    );
    const parent = await signedIn("northwind", login("parent"));
    expect(await rejection(parent.people.staff({}))).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("adding a staff member records their roles, position and work contacts", async () => {
    const api = await signedIn("northwind", login("principal"));
    const options = {
      ...(await api.people.options()),
      relations: await api.guardians.relations(),
    };
    const position = options.positions.find((row) => row.code === "teacher");
    const saved = await api.people.saveStaff({
      names: names("Salama Ashoush", "سلامة عاشور"),
      email: "Salama.Ashoush@northwind.example.com",
      phone: "0100 555 0101",
      roles: ["teacher", "counselor"],
      positionId: position?.id ?? "",
      titleEn: "Head of science",
      titleAr: "رئيس قسم العلوم",
    });
    const member = await api.people.staffMember({ id: saved.id });
    expect(member.roles.toSorted()).toEqual(["counselor", "teacher"]);
    expect(member.email).toBe("salama.ashoush@northwind.example.com");
    expect(member.titleEn).toBe("Head of science");
    const found = await api.people.staff({
      q: "salama.ashoush@northwind.example.com",
    });
    expect(found.rows.map((row) => row.id)).toEqual([saved.id]);
    expect(found.rows[0]?.position?.labelEn).toBeTruthy();
    const byPhone = await api.people.staff({ q: "01005550101" });
    expect(byPhone.rows.map((row) => row.id)).toEqual([saved.id]);

    await api.people.saveStaff({
      id: saved.id,
      expectedVersion: saved.version,
      names: names("Salama Ashoush", "سلامة عاشور"),
      email: "salama.ashoush@northwind.example.com",
      phone: "",
      roles: ["teacher"],
      titleEn: "",
      titleAr: "",
    });
    const after = await api.people.staffMember({ id: saved.id });
    expect(after.roles).toEqual(["teacher"]);
    expect(after.phone).toBe("");
    expect(after.titleEn).toBe("");
  });

  test("a person found by their email joins the staff without a second record", async () => {
    const api = await signedIn("northwind", login("principal"));
    const list = await api.people.students({ q: "NO1004" });
    const guardian = (
      await api.guardians.ofStudent({ studentId: list.rows[0]?.id ?? "" })
    ).guardians.find((row) => row.contacts.length > 0);
    const phone = guardian?.contacts.find((row) => row.kind === "phone")?.value;
    if (!guardian || !phone) throw new Error("seed guardian phone");
    const matches = await api.people.findByContact({ phone });
    expect(matches.map((row) => row.id)).toContain(guardian.userId);
    await api.people.saveStaff({
      existingUserId: guardian.userId,
      names: names("Ignored Name", "اسم متجاهل"),
      email: "second.job@northwind.example.com",
      roles: ["aide"],
    });
    const record = await api.people.person({ id: guardian.userId });
    const held = record.roles.map((role) => role.role);
    expect(held).toContain("aide");
    expect(held.some((role) => role === "parent" || role === "guardian")).toBe(
      true,
    );
    expect(record.fullNameEn).toBe(guardian.fullNameEn);
  });

  test("a phone that cannot be read is refused before anything is saved", async () => {
    const api = await signedIn("northwind", login("principal"));
    expect(
      await rejection(
        api.people.saveStaff({
          names: names("Salama Hassan", "سلامة حسن"),
          email: "salama.hassan@northwind.example.com",
          phone: "12",
          roles: ["staff"],
        }),
      ),
    ).toMatchObject({ message: "contact_point.phone_invalid" });
    const found = await api.people.staff({
      q: "salama.hassan@northwind.example.com",
    });
    expect(found.total).toBe(0);
  });
});

async function newStaff(email: string) {
  const api = await signedIn("northwind", login("principal"));
  const saved = await api.people.saveStaff({
    names: names("Salama Nour", "سلامة نور"),
    email,
    roles: ["teacher"],
  });
  return { api, id: saved.id };
}

describe("sign-in", () => {
  const password = "correct horse battery staple";

  test("an administrator opens a sign-in, and a new password ends the old sessions", async () => {
    const { api, id } = await newStaff("salama.nour@northwind.example.com");
    await api.people.saveSignIn({
      userId: id,
      loginName: "salama.nour@northwind.example.com",
      password,
    });
    const first = await client("northwind").identity.signIn({
      loginName: "salama.nour@northwind.example.com",
      password,
    });
    const session = client("northwind", first.token);
    expect((await session.identity.currentUser()).id).toBe(id);
    const record = await api.people.person({ id });
    expect(record.access.signIn).toBe(true);
    expect(record.account?.loginName).toBe("salama.nour@northwind.example.com");

    await api.people.saveSignIn({
      userId: id,
      loginName: "salama.nour@northwind.example.com",
      password: `${password} again`,
    });
    expect(await rejection(session.identity.currentUser())).toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("a disabled sign-in is refused until it is enabled again", async () => {
    const { api, id } = await newStaff("salama.fawzy@northwind.example.com");
    await api.people.saveSignIn({
      userId: id,
      loginName: "salama.fawzy@northwind.example.com",
      password,
    });
    await api.people.setSignInState({ userId: id, state: "disabled" });
    expect(
      await rejection(
        client("northwind").identity.signIn({
          loginName: "salama.fawzy@northwind.example.com",
          password,
        }),
      ),
    ).toMatchObject({ message: "auth.invalid_credentials" });
    await api.people.setSignInState({ userId: id, state: "active" });
    const session = await client("northwind").identity.signIn({
      loginName: "salama.fawzy@northwind.example.com",
      password,
    });
    expect(session.token).toBeTruthy();
  });

  test("short passwords, taken login names, one's own account and teachers are refused", async () => {
    const { api, id } = await newStaff("salama.adel@northwind.example.com");
    expect(
      await rejection(
        api.people.saveSignIn({
          userId: id,
          loginName: "salama.adel@northwind.example.com",
          password: "short",
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await rejection(
        api.people.saveSignIn({
          userId: id,
          loginName: login("teacher"),
          password,
        }),
      ),
    ).toMatchObject({
      code: "CONFLICT",
      message: "login_identity.login_name_taken",
    });
    const me = await api.identity.currentUser();
    expect(
      await rejection(
        api.people.setSignInState({ userId: me.id, state: "disabled" }),
      ),
    ).toMatchObject({ code: "FORBIDDEN", message: "account.self" });
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.people.saveSignIn({
          userId: id,
          loginName: "salama.adel@northwind.example.com",
          password,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("the office opens sign-ins for the students it picks, and each signs in from their slip", async () => {
    const api = await signedIn("northwind", login("principal"));
    const grade = (await api.gradeLevels.options()).grades.find(
      (row) => row.code === "grade_7",
    );
    if (!grade) throw new Error("options");
    const add = async (reference: string) =>
      (
        await api.people.saveStudent({
          names: names("Salama Ashoush", "سلامة عشوش"),
          reference,
          parts: { grade: { gradeId: grade.id } },
        })
      ).id;
    const [numbered, named, second] = [
      await add("NO9201"),
      await add("NO9202"),
      await add("NO9203"),
    ];
    // Two of the students' numbers are somebody's sign-in name already.
    for (const [taken, email] of [
      ["no9202", "salama.kamal@northwind.example.com"],
      ["no9203", "salama.hany@northwind.example.com"],
    ] as const)
      await api.people.saveSignIn({
        userId: (await newStaff(email)).id,
        loginName: taken,
        password,
      });
    const holder = (await api.people.students({ pageSize: 50 })).rows.find(
      (row) => row.hasAccount,
    );
    if (!numbered || !named || !second || !holder) throw new Error("seed");

    const opened = await api.people.createSignIns({
      studentIds: [numbered, named, second, holder.id],
      way: "slips",
    });
    expect(opened.had).toEqual([holder.id]);
    expect(opened.refused).toEqual([]);
    expect(
      Object.fromEntries(
        opened.slips.map((slip) => [slip.studentId, slip.loginName]),
      ),
    ).toEqual({
      [numbered]: "no9201",
      [named]: "salama.ashoush",
      [second]: "salama.ashoush2",
    });
    for (const slip of opened.slips) {
      expect(slip.password).toMatch(/^(?:[a-z]{4}-){3}[a-z]{4}$/);
      const session = await client("northwind").identity.signIn({
        loginName: slip.loginName,
        password: slip.password,
      });
      const me = await client(
        "northwind",
        session.token,
      ).identity.currentUser();
      expect(me.id).toBe(slip.studentId);
    }
    expect(
      (await api.people.studentHistory({ id: numbered })).rows.map(
        (entry) => entry.action,
      ),
    ).toContain("account.create");

    const again = await api.people.createSignIns({
      studentIds: [numbered, named, second],
      way: "slips",
    });
    expect(again.slips).toEqual([]);
    expect(again.had.toSorted()).toEqual([numbered, named, second].toSorted());
  });

  test("a student nothing can name is left out with the reason, and only the office opens sign-ins", async () => {
    const api = await signedIn("northwind", login("principal"));
    const grade = (await api.gradeLevels.options()).grades.find(
      (row) => row.code === "grade_7",
    );
    if (!grade) throw new Error("options");
    const unnamed = await api.people.saveStudent({
      names: {
        en: { given: "", family: "" },
        ar: { given: "سلامة", family: "عشوش" },
      },
      reference: "7",
      parts: { grade: { gradeId: grade.id } },
    });
    expect(
      await api.people.createSignIns({
        studentIds: [unnamed.id],
        way: "slips",
      }),
    ).toEqual({
      slips: [],
      badges: [],
      invited: [],
      had: [],
      refused: [{ studentId: unnamed.id, reason: "no_name" }],
    });
    // A badge is for a child too young to type a password.
    expect(
      await api.people.createSignIns({
        studentIds: [unnamed.id],
        way: "badges",
      }),
    ).toEqual({
      slips: [],
      badges: [],
      invited: [],
      had: [],
      refused: [{ studentId: unnamed.id, reason: "not_young" }],
    });
    expect(
      await rejection(
        api.people.createSignIns({
          studentIds: [unnamed.id, crypto.randomUUID()],
          way: "slips",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.people.createSignIns({
          studentIds: [unnamed.id],
          way: "slips",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("the office prints badges for the young children it picks who hold none", async () => {
    const school = seeded().tenants[0]?.schools.find(
      (row) => row.slug === "northwind-east",
    );
    const principal = seeded().tenants[0]?.logins.find(
      (row) => row.role === "principal" && row.schoolId === school?.id,
    )?.loginName;
    if (!principal) throw new Error("the seed lacks the young school's head");
    const api = await signedIn("northwind-east", principal);
    const children = (await api.people.students({ pageSize: 50 })).rows
      .filter((row) => !row.hasAccount)
      .slice(0, 2)
      .map((row) => row.id);
    expect(children).toHaveLength(2);

    const printed = await api.people.createSignIns({
      studentIds: children,
      way: "badges",
    });
    expect(printed.refused).toEqual([]);
    expect(printed.badges.map((badge) => badge.studentId).toSorted()).toEqual(
      children.toSorted(),
    );
    for (const badge of printed.badges) {
      const session = await client("northwind-east").identity.badgeSignIn({
        secret: badge.secret,
      });
      const me = await client(
        "northwind-east",
        session.token,
      ).identity.currentUser();
      expect(me).toMatchObject({
        id: badge.studentId,
        profile: "young_student",
      });
    }
    // A child whose badge works keeps it: a new one would stop the card in their bag.
    const again = await api.people.createSignIns({
      studentIds: children,
      way: "badges",
    });
    expect(again.badges).toEqual([]);
    expect(again.had.toSorted()).toEqual(children.toSorted());
  });
});

const motherFlags = async (api: Awaited<ReturnType<typeof signedIn>>) => {
  const relation = (await api.guardians.relations()).find(
    (row) => row.code === "mother",
  );
  if (!relation) throw new Error("seed");
  return {
    relationId: relation.id,
    legalGuardian: true,
    portalAccess: true,
    receivesNotifications: true,
    primaryContact: true,
    emergencyContact: true,
    residence: "primary" as const,
    pickup: "allowed" as const,
  };
};

/** The secret in the link an email to the address carries. */
const linkTo = (address: string) => {
  const message = seeded()
    .mail.sent.filter((row) => row.to === address)
    .at(-1);
  const secret = /\/\/northwind\.[^/\s]+\/welcome#([A-Za-z0-9_-]{43})/.exec(
    message?.text ?? "",
  )?.[1];
  if (!message || !secret) throw new Error(`no link was sent to ${address}`);
  return { message, secret };
};

describe("a link to choose a student's password", () => {
  test("the office sends each guardian a link, one of them chooses the password, and the link then stops", async () => {
    const api = await signedIn("northwind", login("principal"));
    const flags = await motherFlags(api);
    const address = "heba.salama@northwind.example.com";
    const { id: studentId } = await api.people.saveStudent({
      names: names("Salama Ashoush", "سلامة عشوش"),
      reference: "NO9721",
      parts: {
        families: [
          {
            person: {
              names: names("Heba Ashoush", "هبة عشوش"),
              email: address,
            },
            flags,
          },
        ],
      },
    });
    const picked = { studentIds: [studentId], way: "email" as const };
    expect(await api.people.signInsPlan(picked)).toEqual({
      ready: [studentId],
      had: [],
      refused: [],
    });
    expect(await api.people.createSignIns(picked)).toEqual({
      slips: [],
      badges: [],
      invited: [studentId],
      had: [],
      refused: [],
    });
    // The account is opened, but nobody signs in with it yet.
    expect((await api.people.student({ id: studentId })).account).toMatchObject(
      { state: "invited", loginName: "no9721" },
    );
    expect(
      (await api.people.students({ q: "NO9721" })).rows[0]?.hasAccount,
    ).toBe(false);

    const { message, secret } = linkTo(address);
    expect(message.subject).toContain("Salama");
    expect(message.text).toContain("Sign-in name: no9721");
    const open = client("northwind");
    expect(await open.identity.invite({ secret })).toEqual({
      loginName: "no9721",
      name: { en: "Salama", ar: "سلامة" },
      reset: false,
    });
    expect(
      await rejection(
        open.identity.acceptInvite({ secret, password: "too short" }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    const password = "four words make it long";
    expect(
      (await open.identity.acceptInvite({ secret, password })).loginName,
    ).toBe("no9721");

    const session = await open.identity.signIn({
      loginName: "no9721",
      password,
    });
    expect(
      (await client("northwind", session.token).identity.currentUser()).id,
    ).toBe(studentId);
    expect((await api.people.student({ id: studentId })).account).toMatchObject(
      { state: "active", loginName: "no9721" },
    );
    for (const call of [
      () => open.identity.invite({ secret }),
      () =>
        open.identity.acceptInvite({ secret, password: `${password} again` }),
      () => open.identity.invite({ secret: "x".repeat(43) }),
    ])
      expect(await rejection(call())).toMatchObject({
        code: "BAD_REQUEST",
        message: "auth.invalid_invite",
      });
    expect(
      (await api.people.studentHistory({ id: studentId })).rows.map(
        (entry) => entry.action,
      ),
    ).toEqual(
      expect.arrayContaining(["account.create", "account.password_set"]),
    );
  });

  test("a student with no guardian to write to is left out, and a link sent again replaces the first", async () => {
    const api = await signedIn("northwind", login("principal"));
    const flags = await motherFlags(api);
    const alone = await api.people.saveStudent({
      names: names("Salama Nabil", "سلامة نبيل"),
      reference: "NO9722",
      parts: {
        families: [
          {
            person: {
              names: names("Heba Nabil", "هبة نبيل"),
              phone: "0100 555 0722",
            },
            flags,
          },
        ],
      },
    });
    const address = "heba.fouad@northwind.example.com";
    const reached = await api.people.saveStudent({
      names: names("Salama Fouad", "سلامة فؤاد"),
      reference: "NO9723",
      parts: {
        families: [
          {
            person: { names: names("Heba Fouad", "هبة فؤاد"), email: address },
            flags,
          },
        ],
      },
    });
    const picked = {
      studentIds: [alone.id, reached.id],
      way: "email" as const,
    };
    const first = await api.people.createSignIns(picked);
    expect(first.invited).toEqual([reached.id]);
    expect(first.refused).toEqual([
      { studentId: alone.id, reason: "no_email" },
    ]);
    const old = linkTo(address).secret;

    // No password has been chosen, so the office can send the link again.
    expect((await api.people.createSignIns(picked)).invited).toEqual([
      reached.id,
    ]);
    const fresh = linkTo(address).secret;
    expect(fresh).not.toBe(old);
    const open = client("northwind");
    expect(
      await rejection(open.identity.invite({ secret: old })),
    ).toMatchObject({ message: "auth.invalid_invite" });
    expect((await open.identity.invite({ secret: fresh })).loginName).toBe(
      "no9723",
    );

    // A slip printed for the student after all hands over a password, so
    // the link in the family's inbox no longer chooses one.
    const printed = await api.people.createSignIns({
      studentIds: [reached.id],
      way: "slips",
    });
    const [slip] = printed.slips;
    if (!slip) throw new Error("no slip was printed");
    expect(slip.loginName).toBe("no9723");
    expect(
      await rejection(open.identity.invite({ secret: fresh })),
    ).toMatchObject({ message: "auth.invalid_invite" });
    const session = await open.identity.signIn({
      loginName: slip.loginName,
      password: slip.password,
    });
    expect(
      (await client("northwind", session.token).identity.currentUser()).id,
    ).toBe(reached.id);
  });
});

describe("leaving the school", () => {
  const password = "correct horse battery staple";

  /**
   * A student placed in a class from the start of the year, with a mother
   * who signs in to follow them.
   */
  async function enrolled(reference: string, email: string) {
    const api = await signedIn("northwind", login("principal"));
    const options = {
      ...(await api.people.options()),
      relations: await api.guardians.relations(),
    };
    const years = await api.years.options();
    const mother = options.relations.find((row) => row.code === "mother");
    const year = years.years.find((row) => row.id === years.workingYearId);
    const room = (await api.homerooms.directory({})).rows[0];
    if (!mother || !year || !room) throw new Error("seed");
    const { id: studentId } = await api.people.saveStudent({
      names: names("Salama Ashoush", "سلامة عشوش"),
      reference,
      parts: {
        families: [
          {
            person: { names: names("Heba Ashoush", "هبة عشوش"), email },
            flags: {
              relationId: mother.id,
              legalGuardian: true,
              portalAccess: true,
              receivesNotifications: true,
              primaryContact: true,
              emergencyContact: true,
              residence: "primary",
              pickup: "allowed",
            },
          },
        ],
      },
    });
    await api.classes.enrol({
      studentId,
      classId: room.id,
      from: year.startsOn,
    });
    const guardian = (await api.guardians.ofStudent({ studentId }))
      .guardians[0];
    if (!guardian) throw new Error("the guardian was not linked");
    await api.people.saveSignIn({
      userId: guardian.userId,
      loginName: email,
      password,
    });
    const session = await client("northwind").identity.signIn({
      loginName: email,
      password,
    });
    const reason = years.exitTypes.find((row) => row.code === "transfer_out");
    if (!reason) throw new Error("the seed lacks a transfer as a reason");
    const today = (await api.people.students({})).today;
    return {
      api,
      family: client("northwind", session.token),
      studentId,
      year,
      reasonId: reason.id,
      today,
      yesterday: addDays(today, -1),
    };
  }

  test("the office records that a student has left, and the family reads their record until the year is over", async () => {
    const { api, family, studentId, year, reasonId, today, yesterday } =
      await enrolled("NO9711", "heba.ashoush@northwind.example.com");
    expect(
      (await family.home.followed({})).children.map((row) => row.studentId),
    ).toEqual([studentId]);

    const left = await api.people.recordLeaving({
      studentId,
      lastDay: yesterday,
      accessUntil: addDays(year.endsBefore, -1),
      parts: {
        year: { exitTypeId: reasonId, destination: "Nile Valley School" },
      },
    });
    expect(left.lastDay).toBe(yesterday);
    expect(left.accessEndsOn).toBe(year.endsBefore);

    const record = await api.people.student({ id: studentId });
    expect(record.status).toBe("left");
    expect(record.departure).toEqual({
      leftOn: today,
      accessEndsOn: year.endsBefore,
    });
    // The day they left is the day their student role ends, whatever the
    // access the family keeps.
    expect(record.roles.at(-1)?.to).toBe(today);
    const placed = await api.years.placementsOf({ studentId });
    expect(placed.current).toBeNull();
    expect(placed.status).toBe("left");
    expect(placed.placements[0]).toMatchObject({
      to: today,
      exitMeaning: "transfer_out",
      destinationSchool: "Nile Valley School",
    });
    const classes = await api.classes.history({ studentId });
    expect(classes).toHaveLength(1);
    expect(classes[0]?.to).toBe(today);
    expect(
      (await api.people.studentHistory({ id: studentId })).rows.map(
        (entry) => entry.action,
      ),
    ).toContain("student.leave");
    // The school keeps the record, and the family still follows it.
    expect(
      (await api.people.students({ q: "NO9711", status: ["left"] })).rows.map(
        (row) => row.id,
      ),
    ).toEqual([studentId]);
    expect(
      (await family.home.followed({})).children.map((row) => row.studentId),
    ).toEqual([studentId]);
  });

  test("a leaver whose time ends with their last day is no longer the family's to follow, and coming back gives it all back", async () => {
    const { api, family, studentId, year, reasonId, today, yesterday } =
      await enrolled("NO9712", "heba.nour@northwind.example.com");
    const left = await api.people.recordLeaving({
      studentId,
      lastDay: yesterday,
      parts: { year: { exitTypeId: reasonId } },
    });
    expect(left.accessEndsOn).toBe(today);
    // With no child left to follow, the mother's family session stops.
    expect(await rejection(family.home.followed({}))).toMatchObject({
      code: "UNAUTHORIZED",
    });

    expect(await api.people.cancelLeaving({ studentId })).toEqual({
      restored: 1,
    });
    const record = await api.people.student({ id: studentId });
    expect(record.status).toBe("enrolled");
    expect(record.departure).toBeNull();
    expect(
      (await api.years.placementsOf({ studentId })).placements[0],
    ).toMatchObject({
      to: year.endsBefore,
      exitTypeId: null,
      destinationSchool: null,
    });
    expect((await api.classes.history({ studentId }))[0]?.to).toBe(
      year.endsBefore,
    );
    expect(
      (await family.home.followed({})).children.map((row) => row.studentId),
    ).toEqual([studentId]);
    expect(
      (await api.people.studentHistory({ id: studentId })).rows.map(
        (entry) => entry.action,
      ),
    ).toContain("student.return");
    expect(
      await rejection(api.people.cancelLeaving({ studentId })),
    ).toMatchObject({ code: "BAD_REQUEST", message: "leaving.none" });
    // The student came back into a seeded homeroom; other files count its
    // roster, so they leave it again.
    await api.people.recordLeaving({
      studentId,
      lastDay: yesterday,
      parts: { year: { exitTypeId: reasonId } },
    });
  });

  test("a register that marks the student later, a day they were not enrolled and a teacher are refused", async () => {
    const api = await signedIn("northwind", login("principal"));
    const options = await api.years.options();
    const reason = options.exitTypes.find((row) => row.code === "withdrawn");
    const year = options.years.find((row) => row.id === options.workingYearId);
    if (!reason || !year) throw new Error("seed");
    const student = await signedIn("northwind", login("student"));
    const me = await student.identity.currentUser();
    const leaving = {
      studentId: me.id,
      parts: { year: { exitTypeId: reason.id } },
    };
    // The seed's registers mark the student in the days after this one.
    expect(
      await rejection(
        api.people.recordLeaving({ ...leaving, lastDay: "2026-09-14" }),
      ),
    ).toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(
        /^enrollment\.registers_after:\d{4}-\d{2}-\d{2}$/,
      ),
    });
    expect(
      await rejection(
        api.people.recordLeaving({
          ...leaving,
          lastDay: addDays(year.startsOn, -1),
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "leaving.not_enrolled" });
    expect(
      await rejection(
        api.people.recordLeaving({
          ...leaving,
          lastDay: year.startsOn,
          parts: { year: { exitTypeId: crypto.randomUUID() } },
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.people.recordLeaving({ ...leaving, lastDay: year.startsOn }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect((await api.people.student({ id: me.id })).status).toBe("enrolled");
  });
});

describe("families", () => {
  test("a parent linked to two students makes them brothers and sisters", async () => {
    const api = await signedIn("northwind", login("principal"));
    const options = {
      ...(await api.people.options()),
      relations: await api.guardians.relations(),
    };
    const mother = options.relations.find((row) => row.code === "mother");
    if (!mother) throw new Error("options");
    const first = (await api.people.students({ q: "NO1010" })).rows[0];
    const second = (await api.people.students({ q: "NO1011" })).rows[0];
    if (!first || !second) throw new Error("seed students");
    expect(
      (await api.guardians.siblings({ id: first.id })).map((row) => row.userId),
    ).not.toContain(second.id);
    const parent = (await api.guardians.ofStudent({ studentId: first.id }))
      .guardians[0];
    if (!parent) throw new Error("seed guardian");
    await api.guardians.saveLink({
      studentId: second.id,
      existingUserId: parent.userId,
      flags: {
        relationId: mother.id,
        legalGuardian: true,
        portalAccess: true,
        receivesNotifications: true,
        primaryContact: false,
        emergencyContact: true,
        residence: "primary",
        pickup: "allowed",
      },
    });
    expect(
      (await api.guardians.siblings({ id: first.id })).map((row) => row.userId),
    ).toContain(second.id);
    expect(
      (await api.guardians.siblings({ id: second.id })).map(
        (row) => row.userId,
      ),
    ).toContain(first.id);
  });

  test("a second home is the residence on the guardian link", async () => {
    const api = await signedIn("northwind", login("principal"));
    const options = {
      ...(await api.people.options()),
      relations: await api.guardians.relations(),
    };
    const father = options.relations.find((row) => row.code === "father");
    if (!father) throw new Error("options");
    const list = await api.people.students({ q: "NO1006" });
    const studentId = list.rows[0]?.id ?? "";
    await api.guardians.saveLink({
      studentId,
      person: {
        names: names("Karim Second", "كريم ثان"),
        phone: "0100 555 0606",
      },
      flags: {
        relationId: father.id,
        legalGuardian: true,
        portalAccess: false,
        receivesNotifications: true,
        primaryContact: false,
        emergencyContact: false,
        residence: "secondary",
        pickup: "allowed",
      },
    });
    expect(
      (await api.guardians.ofStudent({ studentId: studentId })).guardians.find(
        (row) => row.fullNameEn === "Karim Second",
      )?.residence,
    ).toBe("secondary");
  });

  test("an adult's phone, email and home address are kept and replaced", async () => {
    const api = await signedIn("northwind", login("principal"));
    const studentId =
      (await api.people.students({ q: "NO1007" })).rows[0]?.id ?? "";
    const adultId =
      (await api.guardians.ofStudent({ studentId: studentId })).guardians[0]
        ?.userId ?? "";
    const read = await api.people.person({ id: adultId });
    await api.people.saveContacts({
      userId: adultId,
      expected: shownContacts(read.contacts ?? []),
      phone: "0100 555 0707",
      email: "Salama@Example.com",
      address: {
        lines: ["12 Nile Street", "Floor 3"],
        city: "Zamalek",
        region: "Cairo",
        postalCode: "11211",
        country: "EG",
      },
    });
    const person = await api.people.person({ id: adultId });
    const postal = person.contacts?.find((row) => row.kind === "postal");
    expect(postal?.value).toBe(
      "12 Nile Street, Floor 3, Zamalek, Cairo, 11211",
    );
    expect(postal?.postal).toEqual({
      lines: ["12 Nile Street", "Floor 3"],
      city: "Zamalek",
      region: "Cairo",
      postal_code: "11211",
      country: "EG",
    });
    expect(
      person.contacts?.find((row) => row.kind === "email")?.normalized,
    ).toBe("salama@example.com");
    expect(
      person.contacts?.find((row) => row.kind === "phone")?.normalized,
    ).toBe("+201005550707");
    expect(person.access.contacts).toBe(true);
    await api.people.saveContacts({
      userId: adultId,
      expected: shownContacts(person.contacts ?? []),
      phone: "0100 555 0707",
      email: "",
      address: { lines: [], city: "", region: "", postalCode: "", country: "" },
    });
    const cleared = await api.people.person({ id: adultId });
    expect(cleared.contacts?.map((row) => row.kind)).toEqual(["phone"]);
    // A sheet opened before that save would put back what it showed.
    expect(
      await rejection(
        api.people.saveContacts({
          userId: adultId,
          expected: shownContacts(person.contacts ?? []),
          phone: "0100 555 0707",
          email: "salama@example.com",
          address: {
            lines: [],
            city: "",
            region: "",
            postalCode: "",
            country: "",
          },
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "conflict.version" });
  });

  test("a teacher cannot change contacts and a parent cannot read siblings", async () => {
    const principal = await signedIn("northwind", login("principal"));
    const studentId =
      (await principal.people.students({ q: "NO1008" })).rows[0]?.id ?? "";
    const adultId =
      (await principal.guardians.ofStudent({ studentId: studentId }))
        .guardians[0]?.userId ?? "";
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.people.saveContacts({
          userId: adultId,
          expected: { phone: "", email: "", address: "" },
          phone: "",
          email: "",
          address: {
            lines: [],
            city: "",
            region: "",
            postalCode: "",
            country: "",
          },
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    const parent = await signedIn("northwind", login("parent"));
    expect(
      await rejection(parent.guardians.siblings({ id: studentId })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("photos", () => {
  // The smallest whole JPEG: one grey pixel.
  const jpeg = Uint8Array.from(
    atob(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
    ),
    (char) => char.charCodeAt(0),
  );
  const photo = async (session: Awaited<ReturnType<typeof sessionFor>>) => {
    const file = await session.api.files.initiate({
      purpose: "avatar",
      name: "photo.jpg",
      mediaType: "image/jpeg",
      sizeBytes: jpeg.byteLength,
    });
    const sent = await raw(
      "northwind",
      session.token,
      `/v1/files/${file.id}/content`,
      {
        method: "PUT",
        body: jpeg,
      },
    );
    expect(sent.status).toBe(200);
    return file.id;
  };

  test("grown-ups keep their own photo, and staff who manage people keep students'", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const principal = await sessionFor("northwind", login("principal"));
    const student = await sessionFor("northwind", login("student"));
    const me = await teacher.api.identity.currentUser();

    const mine = await photo(teacher);
    await teacher.api.people.setPhoto({ personId: me.id, fileId: mine });
    expect((await teacher.api.identity.currentUser()).photoFileId).toBe(mine);
    const seen = await raw(
      "northwind",
      principal.token,
      `/v1/files/${mine}/content`,
    );
    expect(seen.status).toBe(200);

    const pupil = await student.api.identity.currentUser();
    const theirs = await photo(student);
    expect(
      await rejection(
        student.api.people.setPhoto({ personId: pupil.id, fileId: theirs }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      await rejection(
        teacher.api.people.setPhoto({ personId: pupil.id, fileId: mine }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });

    const kept = await photo(principal);
    await principal.api.people.setPhoto({ personId: pupil.id, fileId: kept });
    expect(
      (await principal.api.people.student({ id: pupil.id })).photoFileId,
    ).toBe(kept);
    await principal.api.people.setPhoto({ personId: pupil.id, fileId: null });
    expect(
      (await principal.api.people.student({ id: pupil.id })).photoFileId,
    ).toBeNull();
  });
});

describe("a link for an adult's own password", () => {
  const password = "correct horse battery staple";

  test("the office emails a new teacher a link, and the teacher alone chooses the password", async () => {
    const address = "salama.link@northwind.example.com";
    const { api, id } = await newStaff(address);
    expect(
      await api.people.sendSignInLink({ userId: id, loginName: address }),
    ).toEqual({ sent: true, loginName: address });
    const { message, secret } = linkTo(address);
    expect(message.subject).toContain("choose your password");
    expect(message.text).toContain(`Sign-in name: ${address}`);
    const open = client("northwind");
    expect(await open.identity.invite({ secret })).toEqual({
      loginName: address,
      name: { en: "Salama", ar: "سلامة" },
      reset: false,
    });
    await open.identity.acceptInvite({ secret, password });
    const session = await open.identity.signIn({
      loginName: address,
      password,
    });
    expect(session.token).toBeString();
    expect(
      await rejection(open.identity.acceptInvite({ secret, password })),
    ).toMatchObject({ message: "auth.invalid_invite" });
    // The invitation is in the delivery log like every other email.
    const log = await api.notifications.deliveries({ q: "Salama" });
    expect(
      log.rows.find((row) => row.userId === id && row.kind === "invite"),
    ).toMatchObject({ channel: "email", state: "sent" });
  });

  test("someone who chose no language is written to in the school's", async () => {
    const address = "salama.east@northwind.example.com";
    const api = await signedIn("northwind-east", login("principal", 0, 1));
    const saved = await api.people.saveStaff({
      names: names("Salama Nour", "سلامة نور"),
      email: address,
      roles: ["teacher"],
    });
    await api.people.sendSignInLink({ userId: saved.id, loginName: address });
    const message = seeded()
      .mail.sent.filter((row) => row.to === address)
      .at(-1);
    expect(message?.subject).toContain("اختر كلمة مرورك");
  });

  test("a forgotten password is replaced from an emailed link, and every session ends", async () => {
    const address = "salama.reset@northwind.example.com";
    const { api, id } = await newStaff(address);
    await api.people.saveSignIn({ userId: id, loginName: address, password });
    const open = client("northwind");
    const before = await open.identity.signIn({ loginName: address, password });
    expect(
      await open.identity.requestPasswordReset({ loginName: address }),
    ).toEqual({ requested: true });
    const { message, secret } = linkTo(address);
    expect(message.subject).toContain("choose a new password");
    const log = await api.notifications.deliveries({ q: "Salama" });
    expect(
      log.rows.find((row) => row.userId === id && row.kind === "reset"),
    ).toMatchObject({ channel: "email", state: "sent" });
    expect(await open.identity.invite({ secret })).toMatchObject({
      loginName: address,
      reset: true,
    });
    const replaced = "a different phrase entirely";
    await open.identity.acceptInvite({ secret, password: replaced });
    expect(
      await rejection(client("northwind", before.token).identity.currentUser()),
    ).toMatchObject({ code: "UNAUTHORIZED" });
    expect(
      await rejection(open.identity.signIn({ loginName: address, password })),
    ).toMatchObject({ message: "auth.invalid_credentials" });
    expect(
      (await open.identity.signIn({ loginName: address, password: replaced }))
        .token,
    ).toBeString();
  });

  test("asking for a reset tells a stranger nothing and sends nothing", async () => {
    const sent = seeded().mail.sent.length;
    expect(
      await client("northwind").identity.requestPasswordReset({
        loginName: "nobody.here@northwind.example.com",
      }),
    ).toEqual({ requested: true });
    expect(seeded().mail.sent.length).toBe(sent);
  });

  test("resets for one name stop after a few, since each sends an email", async () => {
    const api = client("northwind");
    const loginName = "salama.often@northwind.example.com";
    for (let attempt = 0; attempt < 3; attempt += 1)
      expect(await api.identity.requestPasswordReset({ loginName })).toEqual({
        requested: true,
      });
    expect(
      await rejection(api.identity.requestPasswordReset({ loginName })),
    ).toMatchObject({ message: "auth.too_many_attempts" });
  });
});

describe("who teaches what", () => {
  test("a student's record names their homeroom's teachers", async () => {
    const api = await signedIn("northwind", login("principal"));
    const homeroom = (await api.homerooms.directory({})).rows.find(
      (row) => row.students > 0 && row.teachers.length > 0,
    );
    if (!homeroom) throw new Error("seed homeroom with a teacher");
    const record = await api.classes.record({ id: homeroom.id });
    const student = record.roster[0];
    if (!student) throw new Error("seed student");
    const seen = await api.people.student({ id: student.userId });
    expect(seen.group).toMatchObject({ classId: homeroom.id });
    expect(seen.group?.teachers.map((row) => row.userId)).toEqual(
      record.teachers
        .filter((row) => row.role === "teacher")
        .map((row) => row.userId),
    );
    expect(seen.group?.teachers.length).toBeGreaterThan(0);
  });

  test("a member of staff's record lists the classes they teach this year, open where the viewer may", async () => {
    const office = await signedIn("northwind", login("principal"));
    const teacher = await signedIn("northwind", login("teacher"));
    const me = await teacher.identity.currentUser();
    const mine = (await teacher.classes.mine({})).rows;
    expect(mine.length).toBeGreaterThan(0);

    const read = await office.people.person({ id: me.id });
    expect(read.teaching?.classes.map((row) => row.id).toSorted()).toEqual(
      mine.map((row) => row.id).toSorted(),
    );
    expect(read.teaching?.classes.every((row) => row.canOpen)).toBe(true);

    const staff = await Promise.all(
      (await office.people.staff({ role: ["teacher"] })).rows.map((row) =>
        office.people.person({ id: row.id }),
      ),
    );
    const subjects = staff
      .flatMap((row) => row.teaching?.classes ?? [])
      .filter((row) => row.group !== null && !row.group.own);
    expect(subjects.length).toBeGreaterThan(0);
    expect(subjects.every((row) => row.subject !== null)).toBe(true);

    const colleague = staff.find(
      (row) => row.id !== me.id && (row.teaching?.classes.length ?? 0) > 0,
    );
    if (!colleague) throw new Error("seed colleague who teaches");
    const theirs = await teacher.people.person({ id: colleague.id });
    expect(theirs.teaching?.classes.length).toBeGreaterThan(0);
    for (const row of theirs.teaching?.classes ?? [])
      expect(row.canOpen).toBe(
        await teacher.classes.record({ id: row.id }).then(
          () => true,
          () => false,
        ),
      );

    const parent = await signedIn("northwind", login("parent"));
    const self = await parent.people.person({
      id: (await parent.identity.currentUser()).id,
    });
    expect(self.teaching).toBeNull();
  });
});

/** A seeded family, one of its children, and that child's homeroom teacher. */
async function familyAndTeacher() {
  const office = await signedIn("northwind", login("principal"));
  const parent = await signedIn("northwind", login("parent"));
  const me = await parent.identity.currentUser();
  const [child] = await parent.guardians.children({ userId: me.id });
  if (!child) throw new Error("seed parent with a child");
  const seen = await office.people.student({ id: child.studentId });
  const teacher = seen.group?.teachers[0];
  if (!seen.group || !teacher) throw new Error("seed homeroom with a teacher");
  return { office, parent, me, child, homeroom: seen.group, teacher };
}

describe("teacher profiles", () => {
  test("a family opens its child's teacher's profile, never the staff record", async () => {
    const { parent, homeroom, teacher } = await familyAndTeacher();
    const profile = await parent.people.profile({ id: teacher.userId });
    expect(profile).toMatchObject({
      id: teacher.userId,
      fullNameEn: teacher.fullNameEn,
      access: { message: true },
    });
    expect(profile.roles.map((row) => row.role)).toContain("teacher");
    const classes = profile.teaching?.classes ?? [];
    expect(classes.map((row) => row.id)).toContain(homeroom.classId);
    expect(classes.every((row) => !row.canOpen)).toBe(true);
    expect(Object.keys(profile).toSorted()).toEqual(
      [
        "access",
        "familyNameAr",
        "familyNameEn",
        "fullNameAr",
        "fullNameEn",
        "givenNameAr",
        "givenNameEn",
        "id",
        "photoFileId",
        "preferredGivenName",
        "roles",
        "teaching",
      ].toSorted(),
    );
    expect(
      await rejection(parent.people.person({ id: teacher.userId })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("the profile lists only the classes the teacher takes with the family's children", async () => {
    const { office, parent, teacher } = await familyAndTeacher();
    const record = await office.people.person({ id: teacher.userId });
    const profile = await parent.people.profile({ id: teacher.userId });
    const all = new Set(record.teaching?.classes.map((row) => row.id));
    const shown = profile.teaching?.classes ?? [];
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((row) => all.has(row.id))).toBe(true);
  });

  test("a student opens their own teacher's profile, never the staff record", async () => {
    const student = await signedIn("northwind", login("student"));
    const office = await signedIn("northwind", login("principal"));
    const me = await student.identity.currentUser();
    const seen = await office.people.student({ id: me.id });
    const teacher = seen.group?.teachers[0];
    if (!teacher) throw new Error("seed homeroom with a teacher");
    const profile = await student.people.profile({ id: teacher.userId });
    expect(profile.teaching?.classes.map((row) => row.id)).toContain(
      seen.group?.classId,
    );
    expect(
      await rejection(student.people.person({ id: teacher.userId })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("being in a conversation opens the profile of whoever the family talks to", async () => {
    const office = await signedIn("northwind", login("staff"));
    const parent = await signedIn("northwind", login("parent"));
    const me = await parent.identity.currentUser();
    const keeper = await office.identity.currentUser();
    expect(
      await rejection(parent.people.profile({ id: keeper.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    const { threadId } = await office.messages.start({
      kind: "direct",
      recipientIds: [me.id],
      content: plainContent("A word about the trip"),
    });
    const profile = await parent.people.profile({ id: keeper.id });
    expect(profile.id).toBe(keeper.id);
    expect(profile.teaching?.classes ?? []).toEqual([]);
    const opened = await parent.messages.thread({ id: threadId });
    expect(opened.members.find((row) => row.userId === keeper.id)?.link).toBe(
      "profile",
    );
  });

  test("nobody else has a profile for the family", async () => {
    const parent = await signedIn("northwind", login("parent"));
    const me = (await parent.identity.currentUser()).id;
    const others = await Promise.all(
      [login("parent", 0, 1), login("parent", 0, 2)].map(
        async (name) =>
          (await (await signedIn("northwind", name)).identity.currentUser()).id,
      ),
    );
    const refused = await Promise.all(
      [
        ...others.filter((id) => id !== me),
        "00000000-0000-4000-8000-000000000000",
      ].map((id) => rejection(parent.people.profile({ id }))),
    );
    expect(refused.length).toBeGreaterThan(1);
    for (const refusal of refused)
      expect(refusal).toMatchObject({ code: "NOT_FOUND" });
  });
});
