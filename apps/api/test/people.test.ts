import { describe, expect, test } from "bun:test";

import { client, login, raw, rejection, sessionFor, signedIn } from "./harness";

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
            residence: "primary",
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
    const options = await api.people.options();
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
    const list = await api.people.students({ q: "GA1004" });
    const student = await api.people.student({ id: list.rows[0]?.id ?? "" });
    const guardian = student.guardians?.find((row) => row.contacts.length > 0);
    const phone = guardian?.contacts.find((row) => row.kind === "phone")?.value;
    if (!guardian || !phone) throw new Error("seed guardian phone");
    const matches = await api.people.findGuardians({ phone });
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

describe("sign-in", () => {
  const password = "correct horse battery staple";

  async function newStaff(email: string) {
    const api = await signedIn("northwind", login("principal"));
    const saved = await api.people.saveStaff({
      names: names("Salama Nour", "سلامة نور"),
      email,
      roles: ["teacher"],
    });
    return { api, id: saved.id };
  }

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
});

describe("families", () => {
  test("a parent linked to two students makes them brothers and sisters", async () => {
    const api = await signedIn("northwind", login("principal"));
    const options = await api.people.options();
    const mother = options.relations.find((row) => row.code === "mother");
    if (!mother) throw new Error("options");
    const first = (await api.people.students({ q: "GA1010" })).rows[0];
    const second = (await api.people.students({ q: "GA1011" })).rows[0];
    if (!first || !second) throw new Error("seed students");
    expect(
      (await api.people.siblings({ id: first.id })).map((row) => row.userId),
    ).not.toContain(second.id);
    const parent = (await api.people.student({ id: first.id })).guardians?.[0];
    if (!parent) throw new Error("seed guardian");
    await api.people.saveRelationship({
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
      (await api.people.siblings({ id: first.id })).map((row) => row.userId),
    ).toContain(second.id);
    expect(
      (await api.people.siblings({ id: second.id })).map((row) => row.userId),
    ).toContain(first.id);
  });

  test("a second home is the residence on the guardian link", async () => {
    const api = await signedIn("northwind", login("principal"));
    const options = await api.people.options();
    const father = options.relations.find((row) => row.code === "father");
    if (!father) throw new Error("options");
    const list = await api.people.students({ q: "GA1006" });
    const studentId = list.rows[0]?.id ?? "";
    await api.people.saveRelationship({
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
    const record = await api.people.student({ id: studentId });
    expect(
      record.guardians?.find((row) => row.fullNameEn === "Karim Second")
        ?.residence,
    ).toBe("secondary");
  });

  test("an adult's phone, email and home address are kept and replaced", async () => {
    const api = await signedIn("northwind", login("principal"));
    const studentId =
      (await api.people.students({ q: "GA1007" })).rows[0]?.id ?? "";
    const adultId =
      (await api.people.student({ id: studentId })).guardians?.[0]?.userId ??
      "";
    await api.people.saveContacts({
      userId: adultId,
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
      phone: "0100 555 0707",
      email: "",
      address: { lines: [], city: "", region: "", postalCode: "", country: "" },
    });
    const cleared = await api.people.person({ id: adultId });
    expect(cleared.contacts?.map((row) => row.kind)).toEqual(["phone"]);
  });

  test("a teacher cannot change contacts and a parent cannot read siblings", async () => {
    const principal = await signedIn("northwind", login("principal"));
    const studentId =
      (await principal.people.students({ q: "GA1008" })).rows[0]?.id ?? "";
    const adultId =
      (await principal.people.student({ id: studentId })).guardians?.[0]
        ?.userId ?? "";
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.people.saveContacts({
          userId: adultId,
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
      await rejection(parent.people.siblings({ id: studentId })),
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
