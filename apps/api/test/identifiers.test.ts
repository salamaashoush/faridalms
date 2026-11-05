import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
type Office = Awaited<ReturnType<typeof principal>>;

async function studentAt(office: Office, index: number) {
  const { rows } = await office.people.students({ pageSize: 50 });
  const row = rows[index];
  if (!row) throw new Error("not enough seeded students");
  const record = await office.people.student({ id: row.id });
  return { id: row.id, birthDate: record.birthDate };
}

async function system(office: Office, studentId: string, meaning: string) {
  const { systems } = await office.identifiers.list({ studentId });
  const found = systems.find((row) => row.meaning === meaning);
  if (!found) throw new Error(`no ${meaning} system`);
  return found.id;
}

/** An Egyptian national ID number for someone born on this day. */
function egyptianId(birthDate: string, serial = "0101235") {
  const [year, month, day] = birthDate.split("-");
  return `${year?.startsWith("20") ? "3" : "2"}${year?.slice(2)}${month}${day}${serial}`;
}

describe("identity documents", () => {
  test("a national ID is kept sealed, shown in full only on request, and finds its student", async () => {
    const office = await principal();
    const student = await studentAt(office, 6);
    if (!student.birthDate) throw new Error("seeded student has no birth date");
    const number = egyptianId(student.birthDate, "0202346");
    const saved = await office.identifiers.save({
      studentId: student.id,
      expectedVersion: 0,
      systemId: await system(office, student.id, "national_id"),
      number,
      issuingCountry: "EG",
    });
    expect(saved.birthDateDiffers).toBe(false);
    const { rows } = await office.identifiers.list({ studentId: student.id });
    const row = rows.find((item) => item.id === saved.id);
    expect(row?.sealed).toBe(true);
    expect(row?.shown).not.toContain(number.slice(-4));
    expect((await office.identifiers.reveal({ id: saved.id })).number).toBe(
      number,
    );
    const { rows: history } = await office.people.studentHistory({
      id: student.id,
    });
    expect(history.map((entry) => entry.action)).toContain(
      "external_id.reveal",
    );
    const spaced = `${number.slice(0, 7)} ${number.slice(7)}`;
    const found = await office.people.students({ q: spaced, pageSize: 25 });
    expect(found.rows.map((item) => item.id)).toEqual([student.id]);
  });

  test("a number belongs to one student, and an Egyptian ID must read as one", async () => {
    const office = await principal();
    const first = await studentAt(office, 7);
    const second = await studentAt(office, 8);
    if (!first.birthDate) throw new Error("seeded student has no birth date");
    const number = egyptianId(first.birthDate, "0303457");
    const nationalId = await system(office, first.id, "national_id");
    await office.identifiers.save({
      studentId: first.id,
      expectedVersion: 0,
      systemId: nationalId,
      number,
      issuingCountry: "EG",
    });
    expect(
      await rejection(
        office.identifiers.save({
          studentId: second.id,
          expectedVersion: 0,
          systemId: nationalId,
          number,
          issuingCountry: "EG",
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "external_id.taken" });
    expect(
      await rejection(
        office.identifiers.save({
          studentId: second.id,
          expectedVersion: 0,
          systemId: nationalId,
          number: "12345",
          issuingCountry: "EG",
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "identifiers.egypt" });
    const other = await office.identifiers.save({
      studentId: second.id,
      expectedVersion: 0,
      systemId: nationalId,
      number: egyptianId("2001-01-01", "0404568"),
      issuingCountry: "EG",
    });
    expect(other.birthDateDiffers).toBe(second.birthDate !== "2001-01-01");
  });

  test("a renewed passport's dates change without retyping its number", async () => {
    const office = await principal();
    const student = await studentAt(office, 9);
    const passport = await system(office, student.id, "passport");
    const saved = await office.identifiers.save({
      studentId: student.id,
      expectedVersion: 0,
      systemId: passport,
      number: "P 4471 2290",
      issuingCountry: "AE",
      validFrom: "2021-05-01",
      expiresOn: "2026-05-01",
    });
    const edited = await office.identifiers.save({
      studentId: student.id,
      id: saved.id,
      expectedVersion: saved.version,
      systemId: passport,
      number: "",
      issuingCountry: "AE",
      validFrom: "2021-05-01",
      expiresOn: "2031-05-01",
    });
    const { rows } = await office.identifiers.list({ studentId: student.id });
    const row = rows.find((item) => item.id === saved.id);
    expect(row).toMatchObject({ expiresOn: "2031-05-01", shown: "•••• 2290" });
    expect(edited.version).toBeGreaterThan(saved.version);
    expect((await office.identifiers.reveal({ id: saved.id })).number).toBe(
      "P 4471 2290",
    );
  });

  test("the registrar keeps documents without reading them, and teachers see none", async () => {
    const office = await principal();
    const student = await studentAt(office, 6);
    const registrar = await signedIn("northwind", login("staff"));
    const { rows, canReveal } = await registrar.identifiers.list({
      studentId: student.id,
    });
    expect(canReveal).toBe(false);
    const sealed = rows.find((row) => row.sealed);
    if (!sealed) throw new Error("the student has no sealed document");
    expect(
      await rejection(registrar.identifiers.reveal({ id: sealed.id })),
    ).toMatchObject({ code: "FORBIDDEN" });
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(teacher.identifiers.list({ studentId: student.id })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
