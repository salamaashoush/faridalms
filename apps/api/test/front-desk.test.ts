import { describe, expect, test } from "bun:test";

import { login, rejection, sessionFor, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));

describe("the front desk", () => {
  test("reception signs a child in and out, and records who collected them", async () => {
    const office = await principal();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const name = (me.nameEn ?? "").split(" ")[0] ?? "";
    const found = await office.frontDesk.find({ q: name });
    expect(found.some((row) => row.id === me.id)).toBe(true);

    await office.frontDesk.signIn({ studentId: me.id, at: "09:10" });
    expect(
      await rejection(
        office.frontDesk.signOut({ studentId: me.id, at: "12:30" }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });

    const contacts = await office.frontDesk.pickup({ studentId: me.id });
    const allowed = contacts.find((row) => row.pickup !== "not_allowed");
    if (!allowed) throw new Error("the seeded student has no contact");
    await office.frontDesk.signOut({
      studentId: me.id,
      at: "12:30",
      collectedById: allowed.userId,
      note: "Dentist.",
    });

    const day = await office.frontDesk.day({});
    const mine = day.movements.filter((row) => row.studentId === me.id);
    expect(mine.map((row) => [row.direction, row.at])).toEqual([
      ["out", "12:30"],
      ["in", "09:10"],
    ]);
    expect(mine[0]).toMatchObject({
      collectedByNameEn: allowed.fullNameEn,
      note: "Dentist.",
    });
  });

  test("only the office works the front desk", async () => {
    const { api } = await sessionFor("northwind", login("teacher"));
    expect(await rejection(api.frontDesk.day({}))).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
