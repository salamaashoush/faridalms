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

  test("a teacher finds line drawings to colour in", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    const found = await teacher.library.pictures({ q: "cat", style: "lines" });
    const pictogram = found.pictures.find((row) => row.source === "arasaac");
    const emoji = found.pictures.find((row) => row.source === "openmoji");
    expect(pictogram?.full).toBe(
      `https://api.arasaac.org/v1/pictograms/${pictogram?.id}?color=false`,
    );
    expect(emoji?.full).toMatch(
      /\/openmoji@[\d.]+\/black\/svg\/[\dA-F-]+\.svg$/,
    );
    const coloured = await teacher.library.pictures({ q: "cat" });
    expect(coloured.pictures.map((row) => row.id)).toEqual(
      found.pictures.map((row) => row.id),
    );
    expect(
      coloured.pictures.find((row) => row.source === "openmoji")?.full,
    ).toMatch(/\/color\/svg\//);
  });

  test("a student cannot search the library", async () => {
    const student = await signedIn("northwind", login("student"));
    expect(
      await rejection(student.library.pictures({ q: "cat" })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
