import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

const acmePrincipal = () => login("principal", 1);
const acmeOffice = () => login("staff", 1);

describe("access roles", () => {
  test("the principal sees built-ins, the school's own roles and who holds them", async () => {
    const api = await signedIn("northwind", login("principal"));
    const { roles, grantable } = await api.access.roles();
    const teacher = roles.find((role) => role.builtinKey === "teacher");
    const registrar = roles.find((role) => role.nameEn === "Registrar");
    expect(teacher?.scope).toBe("tenant");
    expect(teacher?.people).toBeGreaterThanOrEqual(6);
    expect(registrar).toMatchObject({
      scope: "school",
      editable: true,
      people: 1,
    });
    expect(grantable).toContain("access:manage");
    expect(grantable).not.toContain("erasure:approve");
    const teacherApi = await signedIn("northwind", login("teacher"));
    expect(await rejection(teacherApi.access.roles())).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("editing a built-in narrows it for this school only", async () => {
    const northwind = await signedIn("northwind", login("principal"));
    const before = (await northwind.access.roles()).roles.find(
      (role) => role.builtinKey === "aide",
    );
    if (!before) throw new Error("seed aide role");
    await northwind.access.saveRole({
      id: before.id,
      expectedVersion: before.version,
      nameEn: "Teaching assistant",
      nameAr: "مساعد معلم",
      capabilities: before.capabilities.filter(
        (capability) => capability !== "attendance:record",
      ),
    });
    const after = (await northwind.access.roles()).roles.find(
      (role) => role.builtinKey === "aide",
    );
    expect(after?.scope).toBe("school");
    expect(after?.capabilities).not.toContain("attendance:record");
    const east = await signedIn(
      "northwind-east",
      login("principal", 0, 1),
    );
    const elsewhere = (await east.access.roles()).roles.find(
      (role) => role.builtinKey === "aide",
    );
    expect(elsewhere?.scope).toBe("tenant");
    expect(elsewhere?.capabilities).toContain("attendance:record");
  });

  test("a role cannot grant what its editor does not hold", async () => {
    const api = await signedIn("northwind", login("principal"));
    expect(
      await rejection(
        api.access.saveRole({
          nameEn: "Erasure desk",
          capabilities: ["erasure:approve"],
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN", message: "access.not_held" });
  });

  test("an assignment adds its capabilities to the person until it ends", async () => {
    const api = await signedIn("northwind", login("principal"));
    const staff = await api.people.staff({ role: ["teacher"] });
    const teacherId = staff.rows[0]?.id ?? "";
    const role = await api.access.saveRole({
      nameEn: "Timetabler",
      nameAr: "منسق الجدول",
      capabilities: ["timetable:manage"],
    });
    const before = await api.access.personAccess({ userId: teacherId });
    expect(before.capabilities).not.toContain("timetable:manage");
    await api.access.assign({
      userId: teacherId,
      accessRoleId: role.id,
      reason: "Builds next year's timetable.",
    });
    const during = await api.access.personAccess({ userId: teacherId });
    expect(during.capabilities).toContain("timetable:manage");
    const assignment = during.assignments.find(
      (row) => row.accessRoleId === role.id,
    );
    if (!assignment) throw new Error("assignment missing");
    expect(assignment.reason).toBe("Builds next year's timetable.");
    await api.access.endAssignmentOf({
      assignmentId: assignment.id,
      expectedVersion: assignment.version,
    });
    const after = await api.access.personAccess({ userId: teacherId });
    expect(after.capabilities).not.toContain("timetable:manage");
    const log = await api.access.changes({});
    expect(log.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "access_role.create",
        "access_assignment.create",
        "access_assignment.end",
      ]),
    );
  });
});

describe("the last holder of access:manage", () => {
  test("stays through every write that could remove them", async () => {
    const api = await signedIn("acme", acmePrincipal());
    const me = await api.identity.currentUser();
    const member = await api.people.staffMember({ id: me.id });
    const names = {
      ar: {
        given: member.givenNameAr ?? "",
        family: member.familyNameAr ?? "",
      },
      en: {
        given: member.givenNameEn ?? "",
        family: member.familyNameEn ?? "",
      },
    };

    // Dropping their own principal role.
    expect(
      await rejection(
        api.people.saveStaff({
          id: me.id,
          expectedVersion: member.version,
          names,
          email: member.email,
          roles: ["teacher"],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "access.last_manager" });

    // Narrowing the built-in that grants it.
    const principalRole = (await api.access.roles()).roles.find(
      (role) => role.builtinKey === "principal",
    );
    if (!principalRole) throw new Error("seed principal role");
    expect(
      await rejection(
        api.access.saveRole({
          id: principalRole.id,
          expectedVersion: principalRole.version,
          nameEn: "Principal",
          capabilities: principalRole.capabilities.filter(
            (capability) => capability !== "access:manage",
          ),
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "access.last_manager" });

    // A deputy holds it through an assignment; the principal then trades
    // their built-ins for a narrower role, leaving the deputy the last holder.
    const office = (await api.people.staff({ q: acmeOffice() })).rows[0];
    if (!office) throw new Error("seed office staff");
    const deputy = await api.access.saveRole({
      nameEn: "Access deputy",
      capabilities: ["access:manage", "staff:manage"],
    });
    await api.access.assign({ userId: office.id, accessRoleId: deputy.id });
    const desk = await api.access.saveRole({
      nameEn: "Staff desk",
      capabilities: ["staff:manage", "people:read"],
    });
    await api.access.assign({
      userId: me.id,
      accessRoleId: desk.id,
      replacesBuiltin: true,
    });

    // Disabling the deputy's sign-in, or ending their assignment, is refused.
    expect(
      await rejection(
        api.people.setSignInState({ userId: office.id, state: "disabled" }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "access.last_manager" });
    const deputyApi = await signedIn("acme", acmeOffice());
    const held = await deputyApi.access.personAccess({ userId: office.id });
    const own = held.assignments.find((row) => row.accessRoleId === deputy.id);
    if (!own) throw new Error("deputy assignment missing");
    expect(
      await rejection(
        deputyApi.access.endAssignmentOf({
          assignmentId: own.id,
          expectedVersion: own.version,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "access.last_manager" });

    // Giving the principal back their built-ins lets the deputy step down.
    const principalAccess = await deputyApi.access.personAccess({
      userId: me.id,
    });
    const narrowing = principalAccess.assignments.find(
      (row) => row.accessRoleId === desk.id,
    );
    if (!narrowing) throw new Error("desk assignment missing");
    await deputyApi.access.endAssignmentOf({
      assignmentId: narrowing.id,
      expectedVersion: narrowing.version,
    });
    await api.access.endAssignmentOf({
      assignmentId: own.id,
      expectedVersion: own.version,
    });
    expect(
      (await api.access.personAccess({ userId: me.id })).capabilities,
    ).toContain("access:manage");
  });

  test("adding a role is refused when it would grant more than the editor holds", async () => {
    const api = await signedIn("northwind", login("principal"));
    const staff = await api.people.staff({ role: ["teacher"] });
    const teacher = staff.rows[0];
    if (!teacher) throw new Error("seed teacher");
    const member = await api.people.staffMember({ id: teacher.id });
    const desk = await api.access.saveRole({
      nameEn: "Staff office",
      capabilities: ["staff:manage", "people:read", "contacts:read"],
    });
    const office = (await api.people.staff({ q: login("staff") })).rows[0];
    if (!office) throw new Error("seed office staff");
    await api.access.assign({
      userId: office.id,
      accessRoleId: desk.id,
      replacesBuiltin: true,
    });
    const officeApi = await signedIn("northwind", login("staff"));
    expect(
      await rejection(
        officeApi.people.saveStaff({
          id: teacher.id,
          expectedVersion: member.version,
          names: {
            ar: {
              given: member.givenNameAr ?? "",
              family: member.familyNameAr ?? "",
            },
            en: {
              given: member.givenNameEn ?? "",
              family: member.familyNameEn ?? "",
            },
          },
          email: member.email,
          roles: ["teacher", "principal"],
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN", message: "access.not_held" });
    const assigned = (
      await api.access.personAccess({ userId: office.id })
    ).assignments.find((row) => row.accessRoleId === desk.id);
    if (!assigned) throw new Error("desk assignment missing");
    await api.access.endAssignmentOf({
      assignmentId: assigned.id,
      expectedVersion: assigned.version,
    });
  });
});
