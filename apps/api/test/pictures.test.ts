import { describe, expect, test } from "bun:test";

import { client, login, rejection, sessionFor, signedIn } from "./harness";

describe("picture search", () => {
  test("a teacher finds pictures by what they show, in English or Arabic", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    const english = await teacher.pictures.search({ q: "banana" });
    expect(english.pictures.length).toBeGreaterThan(0);
    expect(english.pictures[0]).toMatchObject({
      source: "arasaac",
      label: "banana",
    });
    expect(english.pictures[0]?.full).toMatch(
      /^https:\/\/static\.arasaac\.org\//,
    );
    const { token } = await sessionFor("northwind", login("teacher"));
    const arabic = await client("northwind", token, "ar").pictures.search({
      q: "الموز",
    });
    expect(arabic.pictures[0]?.label).toMatch(/^مو/);
    expect(
      await rejection(client("northwind").pictures.search({ q: "cat" })),
    ).toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("a teacher finds line drawings to colour in", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    const found = await teacher.pictures.search({ q: "cat", style: "lines" });
    const pictogram = found.pictures.find((row) => row.source === "arasaac");
    const emoji = found.pictures.find((row) => row.source === "openmoji");
    expect(pictogram?.full).toBe(
      `https://api.arasaac.org/v1/pictograms/${pictogram?.id}?color=false`,
    );
    expect(emoji?.full).toMatch(
      /\/openmoji@[\d.]+\/black\/svg\/[\dA-F-]+\.svg$/,
    );
    const coloured = await teacher.pictures.search({ q: "cat" });
    expect(coloured.pictures.map((row) => row.id)).toEqual(
      found.pictures.map((row) => row.id),
    );
    expect(
      coloured.pictures.find((row) => row.source === "openmoji")?.full,
    ).toMatch(/\/color\/svg\//);
  });

  test("a student cannot search the open pictures", async () => {
    const student = await signedIn("northwind", login("student"));
    expect(
      await rejection(student.pictures.search({ q: "cat" })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
  test("staff search Wikimedia Commons only once their school turns it on, and students never", async () => {
    const principal = await signedIn("northwind", login("principal"));
    const teacher = await signedIn("northwind", login("teacher"));
    const student = await signedIn("northwind", login("student"));
    const commons = { q: "camel", collection: "commons" } as const;
    expect(await principal.school.pictureSources()).toEqual({ commons: false });
    expect(await rejection(teacher.pictures.search(commons))).toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await teacher.identity.currentUser()).commonsPictures).toBe(false);
    expect(
      await rejection(teacher.school.setCommonsPictures({ enabled: true })),
    ).toMatchObject({ code: "FORBIDDEN" });

    await principal.school.setCommonsPictures({ enabled: true });
    try {
      expect((await teacher.identity.currentUser()).commonsPictures).toBe(true);
      const found = await teacher.pictures.search(commons);
      expect(found.pictures).toEqual([
        {
          source: "commons",
          id: "File:Camel in the desert.jpg",
          label: "A camel resting in the desert",
          alt: "A camel resting in the desert",
          thumb:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Camel.jpg/330px-Camel.jpg",
          full: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Camel.jpg/1280px-Camel.jpg",
          credit: expect.objectContaining({ licence: "CC BY-SA 4.0" }),
        },
      ]);
      expect((await student.identity.currentUser()).commonsPictures).toBe(
        false,
      );
      expect(await rejection(student.pictures.search(commons))).toMatchObject({
        code: "FORBIDDEN",
      });
    } finally {
      await principal.school.setCommonsPictures({ enabled: false });
    }
    expect(await rejection(teacher.pictures.search(commons))).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
