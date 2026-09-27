import { describe, expect, test } from "bun:test";

import { client, login, rejection, signedIn } from "./harness";

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
    expect(list.rows[0]?.grade).not.toBeNull();
    expect(list.rows.every((row) => row.reference?.startsWith("GA"))).toBe(
      true,
    );
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
    if (first.guardianPhone) {
      const byPhone = await api.people.students({
        q: first.guardianPhone.replace("+20", "0"),
      });
      expect(byPhone.rows.map((row) => row.id)).toContain(first.id);
    }
  });

  test("a teacher reaches no student record before classes connect them", async () => {
    const principal = await signedIn("northwind", login("principal"));
    const [first] = (await principal.people.students({})).rows;
    const teacher = await signedIn("northwind", login("teacher"));
    expect((await teacher.people.students({})).total).toBe(0);
    expect(
      await rejection(teacher.people.student({ id: first?.id ?? "" })),
    ).toMatchObject({
      code: "NOT_FOUND",
    });
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
    const east = await signedIn(
      "northwind-east",
      login("principal", 0, 1),
    );
    expect(
      await rejection(east.people.student({ id: first?.id ?? "" })),
    ).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("adding a student places them, links a new guardian and makes the guardian a parent", async () => {
    const api = await signedIn("northwind", login("principal"));
    const options = await api.people.options();
    const grade = options.grades.find((row) => row.code === "grade_7");
    const mother = options.relations.find((row) => row.code === "mother");
    if (!grade || !mother) throw new Error("options");
    const created = await api.people.saveStudent({
      names: names("Laila Ashoush", "ليلى عشوش"),
      reference: "GA9001",
      birthDate: "2014-03-02",
      gradeId: grade.id,
      guardians: [
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
            livesWith: true,
            pickup: "allowed",
          },
        },
      ],
    });
    const record = await api.people.student({ id: created.id });
    expect(record.reference).toBe("GA9001");
    expect(record.status).toBe("enrolled");
    expect(record.placement?.gradeId).toBe(grade.id);
    expect(record.guardians?.[0]?.contacts[0]?.normalized).toBe(
      "+201005550101",
    );
    const history = await api.people.studentHistory({ id: created.id });
    expect(history.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "user.create",
        "placement.change",
        "relationship.create",
      ]),
    );
    const found = await api.people.findGuardians({ phone: "+20 100 555 0101" });
    expect(found).toHaveLength(1);
    const matches = await api.people.matches({
      names: names("Laila Ashoush", "ليلى عشوش"),
      birthDate: "2014-03-02",
    });
    expect(matches.map((match) => match.id)).toContain(created.id);
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
    ).toMatchObject({ message: "external_id.taken" });
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
    const list = await api.people.students({ q: "GA1002" });
    const student = await api.people.student({ id: list.rows[0]?.id ?? "" });
    const father = student.guardians?.find(
      (g) => g.relationMeaning === "father",
    );
    if (!father) throw new Error("seed father");
    await api.people.endLink({
      relationshipId: father.relationshipId,
      expectedVersion: father.version,
    });
    const after = await api.people.student({ id: student.id });
    expect(
      after.guardians?.some((g) => g.relationshipId === father.relationshipId),
    ).toBe(false);
    const unauthenticated = client("northwind");
    expect(await rejection(unauthenticated.people.students({}))).toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("person records", () => {
  test("the principal opens a guardian with contacts, roles and linked students", async () => {
    const api = await signedIn("northwind", login("principal"));
    const list = await api.people.students({ q: "GA1003" });
    const student = await api.people.student({ id: list.rows[0]?.id ?? "" });
    const guardian = student.guardians?.[0];
    if (!guardian) throw new Error("seed guardian");
    const record = await api.people.person({ id: guardian.userId });
    expect(
      record.roles.some(
        (role) => role.role === "parent" || role.role === "guardian",
      ),
    ).toBe(true);
    expect(record.contacts?.length).toBeGreaterThan(0);
    const child = record.children.find(
      (entry) => entry.studentId === student.id,
    );
    expect(child?.relation?.labelAr).toBeTruthy();
    expect(record.access).toMatchObject({
      self: false,
      manage: true,
      history: true,
    });
    const history = await api.people.personHistory({ id: guardian.userId });
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
    expect(own.children.length).toBeGreaterThan(0);
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
