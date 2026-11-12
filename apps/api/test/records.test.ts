import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

async function studentWith(
  api: Awaited<ReturnType<typeof signedIn>>,
  alert: boolean,
) {
  const list = await api.people.students({ pageSize: 50 });
  const row = list.rows.find((entry) => entry.medicalAlert === alert);
  if (!row) throw new Error(`no seeded student with medicalAlert=${alert}`);
  return row.id;
}

describe("health records", () => {
  test("the principal reads decrypted records, and the read is on the student's history", async () => {
    const api = await signedIn("northwind", login("principal"));
    const studentId = await studentWith(api, true);
    const health = await api.records.health({ studentId });
    const allergy = health.records.find((row) => row.hasAlert);
    expect(allergy).toMatchObject({
      text: "Peanuts",
      severity: "severe",
      actionPlan: "EpiPen in the office",
    });
    expect(health.records.some((row) => row.text === "O+")).toBe(true);
    const { rows: history } = await api.people.studentHistory({
      id: studentId,
    });
    expect(history.map((entry) => entry.action)).toContain(
      "health_record.read",
    );
  });

  test("a registrar without health access is refused", async () => {
    const principal = await signedIn("northwind", login("principal"));
    const studentId = await studentWith(principal, true);
    const registrar = await signedIn("northwind", login("staff"));
    expect(
      await rejection(registrar.records.health({ studentId })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("an alert on a new record raises the header flag, and removing it lowers it", async () => {
    const api = await signedIn("northwind", login("principal"));
    const studentId = await studentWith(api, false);
    const { kinds } = await api.records.health({ studentId });
    const allergy = kinds.find((kind) => kind.code === "allergy") ?? kinds[0];
    if (!allergy) throw new Error("seed health kinds");
    const saved = await api.records.saveHealth({
      studentId,
      kindId: allergy.id,
      hasAlert: true,
      text: "Bee stings",
      severity: "moderate",
      actionPlan: "Antihistamine in the clinic",
    });
    expect((await api.people.student({ id: studentId })).medicalAlert).toBe(
      true,
    );
    const stored = (await api.records.health({ studentId })).records.find(
      (row) => row.id === saved.id,
    );
    if (!stored) throw new Error("record missing");
    expect(stored).toMatchObject({ text: "Bee stings", severity: "moderate" });
    await api.records.removeHealth({
      studentId,
      id: stored.id,
      expectedVersion: stored.version,
    });
    expect((await api.people.student({ id: studentId })).medicalAlert).toBe(
      false,
    );
  });
});

describe("demographics", () => {
  test("background details save and read back behind their purpose", async () => {
    const api = await signedIn("northwind", login("principal"));
    const studentId = await studentWith(api, false);
    const before = await api.records.demographics({ userId: studentId });
    await api.records.saveDemographics({
      userId: studentId,
      expectedVersion: before.version,
      birthCountryCode: "EG",
      birthCity: "Alexandria",
      nationalityCodes: ["EG", "SA"],
      homeLanguages: ["ar", "en"],
    });
    const after = await api.records.demographics({ userId: studentId });
    expect(after).toMatchObject({
      birthCity: "Alexandria",
      nationalityCodes: ["EG", "SA"],
      homeLanguages: ["ar", "en"],
    });
    expect(
      await rejection(
        api.records.saveDemographics({
          userId: studentId,
          expectedVersion: before.version,
          nationalityCodes: [],
          homeLanguages: [],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT" });
  });
});

describe("custody", () => {
  test("a restriction on a guardian raises the custody flag and reads back for the registrar", async () => {
    const api = await signedIn("northwind", login("principal"));
    const list = await api.people.students({ q: "NO1005" });
    const studentId = list.rows[0]?.id ?? "";
    const { links } = await api.guardians.custody({ studentId });
    const link = links[0];
    if (!link) throw new Error("seed guardian");
    await api.guardians.saveCustody({
      studentId,
      relationshipId: link.relationshipId,
      expectedVersion: link.version,
      contactRestrictions: "May not collect the student.",
      educationalRights: "full",
      communicationIsolated: false,
      pickup: "not_allowed",
    });
    expect((await api.people.student({ id: studentId })).alerts).toContain(
      "custody",
    );
    const registrar = await signedIn("northwind", login("staff"));
    const seen = await registrar.guardians.custody({ studentId });
    expect(
      seen.links.find((row) => row.relationshipId === link.relationshipId),
    ).toMatchObject({
      contactRestrictions: "May not collect the student.",
      pickup: "not_allowed",
    });
  });
});
