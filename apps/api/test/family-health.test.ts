import { describe, expect, test } from "bun:test";

import { login, rejection, seeded, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));

function loginAt(slug: string, role: string, index = 0) {
  const tenant = seeded().tenants.find((row) =>
    row.schools.some((school) => school.slug === slug),
  );
  const school = tenant?.schools.find((row) => row.slug === slug);
  const name = tenant?.logins
    .filter((row) => row.role === role && row.schoolId === school?.id)
    .at(index)?.loginName;
  if (!name)
    throw new Error(
      `the seed has no ${role} ${index} at ${slug} of ${tenant?.logins.filter((row) => row.role === role && row.schoolId === school?.id).length}`,
    );
  return name;
}

/**
 * A Northwind mother the seed made a confirmed legal guardian, by index.
 * The suite starts past the parents other suites use, so each test owns
 * its family.
 */
async function family(index: number) {
  const api = await signedIn(
    "northwind",
    loginAt("northwind", "parent", 8 + index),
  );
  const me = await api.identity.currentUser();
  const record = await api.people.person({ id: me.id });
  const child = record.children[0];
  if (!child) throw new Error("the seeded mother follows no child");
  return { api, me, studentId: child.studentId };
}

async function linkOf(
  office: Awaited<ReturnType<typeof principal>>,
  studentId: string,
  userId: string,
) {
  const student = await office.people.student({ id: studentId });
  const link = student.guardians?.find((row) => row.userId === userId);
  if (!link) throw new Error("the mother is linked to her child");
  return link;
}

async function kindId(
  office: Awaited<ReturnType<typeof principal>>,
  studentId: string,
  code: string,
) {
  const { kinds } = await office.records.health({ studentId });
  const kind = kinds.find((row) => row.code === code);
  if (!kind) throw new Error(`the seed has the ${code} health kind`);
  return kind.id;
}

describe("the family's medical summary", () => {
  test("a confirmed legal guardian reads allergies, conditions, diet and contacts, and not the staff's notes", async () => {
    const office = await principal();
    const { api, me, studentId } = await family(0);
    await office.records.saveHealth({
      studentId,
      kindId: await kindId(office, studentId, "allergy"),
      hasAlert: false,
      text: "Peanuts",
      severity: "severe",
      actionPlan: "EpiPen in the nurse's office",
    });
    await office.records.saveHealth({
      studentId,
      kindId: await kindId(office, studentId, "blood_group"),
      hasAlert: false,
      text: "O+",
    });
    await office.records.saveHealth({
      studentId,
      kindId: await kindId(office, studentId, "dietary_requirement"),
      hasAlert: false,
      text: "Vegetarian",
    });

    const summary = await api.records.familyHealth({ studentId });
    if (!summary.permitted) throw new Error("the mother is permitted");
    expect(summary.records).toContainEqual(
      expect.objectContaining({
        kind: "allergy",
        text: "Peanuts",
        severity: "severe",
      }),
    );
    expect(summary.records).toContainEqual(
      expect.objectContaining({
        kind: "dietary_requirement",
        text: "Vegetarian",
      }),
    );
    expect(summary.records.some((row) => row.text === "O+")).toBe(false);
    expect(JSON.stringify(summary)).not.toContain("EpiPen");
    expect(
      summary.contacts.some(
        (row) => row.fullNameEn === me.nameEn && row.phone !== null,
      ),
    ).toBe(true);

    const history = await office.people.studentHistory({ id: studentId });
    expect(
      history.some(
        (entry) =>
          entry.action === "health_record.read" &&
          entry.actorNameEn === me.nameEn,
      ),
    ).toBe(true);
  });

  test("an added allergy waits for the office, and once accepted is in the record and the family is told", async () => {
    const office = await principal();
    const { api, me, studentId } = await family(1);
    const asked = await api.records.askHealthChange({
      target: "record",
      studentId,
      kind: "allergy",
      text: "Sesame",
      severity: "moderate",
    });
    expect(asked.dueOn >= (await office.privacy.overview()).today).toBe(true);

    const waiting = await api.records.familyHealth({ studentId });
    if (!waiting.permitted) throw new Error("the mother is permitted");
    expect(waiting.records.some((row) => row.text === "Sesame")).toBe(false);
    expect(waiting.changes).toContainEqual(
      expect.objectContaining({
        id: asked.id,
        state: "open",
        after: { text: "Sesame", severity: "moderate" },
      }),
    );

    const queue = await office.records.healthChanges({ open: true });
    const row = queue.changes.find((change) => change.id === asked.id);
    expect(row).toMatchObject({
      studentId,
      adds: true,
      now: null,
      asked: { text: "Sesame", severity: "moderate" },
      state: "open",
      kind: { meaning: "allergy" },
    });

    const register = await office.privacy.overview();
    expect(register.requests).toContainEqual(
      expect.objectContaining({
        id: asked.id,
        kind: "correction",
        topic: "health",
      }),
    );
    expect(
      await rejection(
        office.privacy.closeRequest({
          id: asked.id,
          outcome: "completed",
          note: "Done by hand.",
        }),
      ),
    ).toMatchObject({ message: "privacy.answered_elsewhere" });

    await office.records.decideHealthChange({
      id: asked.id,
      decision: "accepted",
    });
    const staff = await office.records.health({ studentId });
    expect(staff.records).toContainEqual(
      expect.objectContaining({ text: "Sesame", severity: "moderate" }),
    );
    const after = await api.records.familyHealth({ studentId });
    if (!after.permitted) throw new Error("the mother is permitted");
    expect(after.records.some((record) => record.text === "Sesame")).toBe(true);
    expect(after.changes.find((change) => change.id === asked.id)?.state).toBe(
      "accepted",
    );
    const closed = (await office.privacy.overview()).requests.find(
      (request) => request.id === asked.id,
    );
    expect(closed?.outcome).toBe("completed");

    const notices = await api.notifications.list({ tab: "all" });
    expect(
      notices.rows.some(
        (notice) =>
          notice.kind === "correction" &&
          notice.subjectId === asked.id &&
          notice.params.report === "accepted",
      ),
    ).toBe(true);
    const history = await office.people.studentHistory({ id: studentId });
    expect(history.map((entry) => entry.action)).toContain(
      "health_change.accept",
    );
    expect(row?.requesterNameEn).toBe(me.nameEn);
    expect(
      await rejection(
        office.records.decideHealthChange({
          id: asked.id,
          decision: "declined",
          reason: "Twice",
        }),
      ),
    ).toMatchObject({ message: "health.change_decided" });
  });

  test("a change to an entry is compared with what is held, and declining keeps the record and gives the reason", async () => {
    const office = await principal();
    const { api, studentId } = await family(2);
    await office.records.saveHealth({
      studentId,
      kindId: await kindId(office, studentId, "medication"),
      hasAlert: false,
      text: "Inhaler before sport",
      actionPlan: "Kept in the PE office",
    });
    const before = await api.records.familyHealth({ studentId });
    if (!before.permitted) throw new Error("the mother is permitted");
    const medicine = before.records.find(
      (row) => row.text === "Inhaler before sport",
    );
    if (!medicine) throw new Error("the medicine reads back");
    expect(
      await rejection(
        api.records.askHealthChange({
          target: "record",
          studentId,
          kind: "medication",
          recordId: medicine.id,
          expectedVersion: medicine.version,
          text: "Inhaler before sport",
        }),
      ),
    ).toMatchObject({ message: "health.change_unchanged" });
    const asked = await api.records.askHealthChange({
      target: "record",
      studentId,
      kind: "medication",
      recordId: medicine.id,
      expectedVersion: medicine.version,
      text: "Inhaler twice a day",
    });
    const row = (
      await office.records.healthChanges({ open: true })
    ).changes.find((change) => change.id === asked.id);
    expect(row).toMatchObject({
      adds: false,
      now: { text: "Inhaler before sport", severity: null },
      asked: { text: "Inhaler twice a day", severity: null },
    });
    await office.records.decideHealthChange({
      id: asked.id,
      decision: "declined",
      reason: "The doctor's letter says before sport only.",
    });
    const after = await api.records.familyHealth({ studentId });
    if (!after.permitted) throw new Error("the mother is permitted");
    expect(
      after.records.find((record) => record.id === medicine.id)?.text,
    ).toBe("Inhaler before sport");
    expect(
      after.changes.find((change) => change.id === asked.id),
    ).toMatchObject({
      state: "declined",
      reason: "The doctor's letter says before sport only.",
    });
    const notices = await api.notifications.list({ tab: "all" });
    expect(
      notices.rows.some(
        (notice) =>
          notice.subjectId === asked.id && notice.params.report === "declined",
      ),
    ).toBe(true);
  });

  test("an accepted edit keeps the staff's own plan, and a stale comparison is refused", async () => {
    const office = await principal();
    const { api, studentId } = await family(3);
    await office.records.saveHealth({
      studentId,
      kindId: await kindId(office, studentId, "chronic_condition"),
      hasAlert: false,
      text: "Asthma",
      actionPlan: "Reliever in the clinic",
    });
    const summary = await api.records.familyHealth({ studentId });
    if (!summary.permitted) throw new Error("the mother is permitted");
    const asthma = summary.records.find((row) => row.text === "Asthma");
    if (!asthma) throw new Error("the condition reads back");
    const asked = await api.records.askHealthChange({
      target: "record",
      studentId,
      kind: "chronic_condition",
      recordId: asthma.id,
      expectedVersion: asthma.version,
      text: "Asthma, worse in winter",
    });
    expect(
      await rejection(
        office.records.decideHealthChange({
          id: asked.id,
          decision: "accepted",
          expectedVersion: asthma.version + 1,
        }),
      ),
    ).toMatchObject({ message: "conflict.version" });
    await office.records.decideHealthChange({
      id: asked.id,
      decision: "accepted",
      expectedVersion: asthma.version,
    });
    const held = (await office.records.health({ studentId })).records.find(
      (row) => row.id === asthma.id,
    );
    expect(held).toMatchObject({
      text: "Asthma, worse in winter",
      actionPlan: "Reliever in the clinic",
      hasAlert: false,
    });
  });

  test("an emergency contact's new phone reaches the contact once accepted", async () => {
    const office = await principal();
    const { api, me, studentId } = await family(4);
    const summary = await api.records.familyHealth({ studentId });
    if (!summary.permitted) throw new Error("the mother is permitted");
    const contact = summary.contacts.find(
      (row) => row.fullNameEn === me.nameEn,
    );
    if (!contact) throw new Error("the mother is an emergency contact");
    expect(
      await rejection(
        api.records.askHealthChange({
          target: "contact",
          studentId,
          relationshipId: contact.relationshipId,
          phone: "12",
        }),
      ),
    ).toMatchObject({ message: "contact_point.phone_invalid" });
    const asked = await api.records.askHealthChange({
      target: "contact",
      studentId,
      relationshipId: contact.relationshipId,
      phone: "01001234567",
    });
    const unchanged = await api.records.familyHealth({ studentId });
    if (!unchanged.permitted) throw new Error("the mother is permitted");
    expect(
      unchanged.contacts.find(
        (row) => row.relationshipId === contact.relationshipId,
      )?.phone,
    ).toBe(contact.phone);
    await office.records.decideHealthChange({
      id: asked.id,
      decision: "accepted",
    });
    const after = await api.records.familyHealth({ studentId });
    if (!after.permitted) throw new Error("the mother is permitted");
    expect(
      after.contacts.find(
        (row) => row.relationshipId === contact.relationshipId,
      )?.phone,
    ).toBe("+201001234567");
  });
});

describe("who the medical summary reaches", () => {
  test("a guardian the school cut off, or who is not a legal guardian, is told it is not shared and cannot ask", async () => {
    const office = await principal();
    const { api, me, studentId } = await family(5);
    const ask = () =>
      api.records.askHealthChange({
        target: "record",
        studentId,
        kind: "allergy",
        text: "Dust",
      });
    const link = await linkOf(office, studentId, me.id);
    const { links } = await office.records.custody({ studentId });
    const custody = links.find(
      (row) => row.relationshipId === link.relationshipId,
    );
    if (!custody) throw new Error("the mother's custody record");
    await office.records.saveCustody({
      studentId,
      relationshipId: link.relationshipId,
      expectedVersion: custody.version,
      contactRestrictions: "No contact by court order.",
      educationalRights: "full",
      communicationIsolated: true,
      pickup: "not_allowed",
    });
    expect(await api.records.familyHealth({ studentId })).toEqual({
      permitted: false,
    });
    expect(await rejection(ask())).toMatchObject({
      code: "FORBIDDEN",
      message: "health.not_permitted",
    });
    const isolated = await linkOf(office, studentId, me.id);
    await office.records.saveCustody({
      studentId,
      relationshipId: link.relationshipId,
      expectedVersion: isolated.version,
      contactRestrictions: "",
      educationalRights: "full",
      communicationIsolated: false,
      pickup: "allowed",
    });
    expect((await api.records.familyHealth({ studentId })).permitted).toBe(
      true,
    );

    const current = await linkOf(office, studentId, me.id);
    const flags = {
      relationId: current.relationId,
      portalAccess: current.portalAccess,
      receivesNotifications: current.receivesNotifications,
      primaryContact: current.primaryContact,
      emergencyContact: current.emergencyContact,
      residence: current.residence,
      pickup: current.pickup,
    };
    await office.people.saveRelationship({
      studentId,
      relationshipId: current.relationshipId,
      expectedVersion: current.version,
      flags: { ...flags, legalGuardian: false },
    });
    expect(await api.records.familyHealth({ studentId })).toEqual({
      permitted: false,
    });
    expect(await rejection(ask())).toMatchObject({ code: "FORBIDDEN" });
    const unconfirmed = await linkOf(office, studentId, me.id);
    await office.people.saveRelationship({
      studentId,
      relationshipId: unconfirmed.relationshipId,
      expectedVersion: unconfirmed.version,
      flags: { ...flags, legalGuardian: true },
    });
    expect((await api.records.familyHealth({ studentId })).permitted).toBe(
      true,
    );
  });

  test("a family cannot read or ask about another family's child", async () => {
    const one = await family(6);
    const other = await family(7);
    expect(other.studentId).not.toBe(one.studentId);
    expect(
      await rejection(
        one.api.records.familyHealth({ studentId: other.studentId }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await rejection(
        one.api.records.askHealthChange({
          target: "record",
          studentId: other.studentId,
          kind: "allergy",
          text: "Cats",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await rejection(one.api.records.healthChanges({ open: true })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("the office's queue is the school's own, and staff without health access are refused it", async () => {
    const { api, studentId } = await family(8);
    const asked = await api.records.askHealthChange({
      target: "record",
      studentId,
      kind: "doctor",
      text: "Dr Hana Farouk, Zamalek Clinic, 0223456789",
    });
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(teacher.records.healthChanges({ open: true })),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      await rejection(
        teacher.records.decideHealthChange({
          id: asked.id,
          decision: "accepted",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });

    const east = await signedIn(
      "northwind-east",
      loginAt("northwind-east", "principal"),
    );
    expect(
      (await east.records.healthChanges({ open: false })).changes.some(
        (change) => change.id === asked.id,
      ),
    ).toBe(false);
    expect(
      await rejection(
        east.records.decideHealthChange({ id: asked.id, decision: "accepted" }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    const acme = await signedIn("acme", login("principal", 1));
    expect(
      (await acme.records.healthChanges({ open: false })).changes.some(
        (change) => change.id === asked.id,
      ),
    ).toBe(false);
    expect(
      await rejection(
        acme.records.decideHealthChange({ id: asked.id, decision: "accepted" }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    const office = await principal();
    expect(
      (await office.records.healthChanges({ open: true })).changes.some(
        (change) => change.id === asked.id,
      ),
    ).toBe(true);
  });
});
