import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import { client, rejection, seeded, testDirectory } from "./harness";

const stranger = (network = "198.51.100.20") =>
  client("", undefined, "en", { "x-forwarded-for": network }).identity;

describe("the portal's face", () => {
  test("a stranger sees the school's names, colours, contact and website, and nothing else", async () => {
    const face = await stranger().portalFace({ school: "northwind" });
    expect(Object.keys(face).toSorted()).toEqual(
      [
        "contact",
        "logoKey",
        "name",
        "palette",
        "paused",
        "school",
        "turnstileKey",
        "websiteHost",
      ].toSorted(),
    );
    expect(face.name).toEqual({
      en: "Northwind International College",
      ar: "كلية نورثويند الدولية",
    });
    expect(face.palette?.primary).toBe("#0B3D91");
    expect(face.websiteHost).toBe("northwind.example.net");
    expect(face.paused).toBe(false);
  });

  test("a school that does not exist has no face", async () => {
    expect(
      await rejection(stranger().portalFace({ school: "nowhere" })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("the school finder", () => {
  test("finds schools by name in either language, with only their names and portal", async () => {
    const found = await stranger("198.51.100.21").findSchools({
      query: "northwind",
    });
    expect(found.schools.map((school) => school.slug)).toEqual([
      "northwind",
      "northwind-east",
    ]);
    expect(found.schools[0]).toEqual({
      slug: "northwind",
      nameEn: "Northwind International College",
      nameAr: "كلية نورثويند الدولية",
      portalHost: "northwind.example.com",
    });
    const arabic = await stranger("198.51.100.21").findSchools({
      query: "مدرسه اكمي",
    });
    expect(arabic.schools.map((school) => school.slug)).toEqual(["acme"]);
  });

  test("a school that is not listed, or not open, is not found by name", async () => {
    const directory = new SQL(testDirectory().adminUrl);
    const acme = seeded().tenants[1]?.tenantId ?? "";
    try {
      await directory`update schools set listed = false where slug = 'acme'`;
      const finder = stranger("198.51.100.22");
      expect(
        (await finder.findSchools({ query: "acme school" })).schools,
      ).toEqual([]);
      expect(
        (await finder.findSchools({ query: "acme" })).schools.map(
          (school) => school.slug,
        ),
      ).toEqual(["acme"]);
      await directory`update schools set listed = true where slug = 'acme'`;
      await directory`update tenants set state = 'suspended' where id = ${acme}::uuid`;
      expect((await finder.findSchools({ query: "acme" })).schools).toEqual([]);
    } finally {
      await directory`update schools set listed = true where slug = 'acme'`;
      await directory`update tenants set state = 'active' where id = ${acme}::uuid`;
      await directory.close();
    }
  });

  test("one network is held to a few searches a minute", async () => {
    const finder = stranger("203.0.113.77");
    let refused: unknown = null;
    for (let attempt = 0; attempt < 40 && !refused; attempt += 1)
      refused = await finder.findSchools({ query: "north" }).then(
        () => null,
        (error: unknown) => error,
      );
    expect(refused).toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
