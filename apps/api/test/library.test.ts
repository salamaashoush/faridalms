import { describe, expect, test } from "bun:test";

import { client, login, rejection, sessionFor, signedIn } from "./harness";

describe("picture library", () => {
  test("a teacher finds pictures by what they show, in English or Arabic", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    const english = await teacher.library.pictures({ q: "banana" });
    expect(english.pictures.length).toBeGreaterThan(0);
    expect(english.pictures[0]).toMatchObject({
      source: "arasaac",
      label: "banana",
    });
    expect(english.pictures[0]?.full).toMatch(
      /^https:\/\/static\.arasaac\.org\//,
    );
    const { token } = await sessionFor("northwind", login("teacher"));
    const arabic = await client("northwind", token, "ar").library.pictures({
      q: "الموز",
    });
    expect(arabic.pictures[0]?.label).toMatch(/^مو/);
    expect(
      await rejection(client("northwind").library.pictures({ q: "cat" })),
    ).toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("a student cannot search the library", async () => {
    const student = await signedIn("northwind", login("student"));
    expect(
      await rejection(student.library.pictures({ q: "cat" })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
