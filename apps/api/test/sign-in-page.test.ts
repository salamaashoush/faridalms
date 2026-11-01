import { contentPlainText } from "@faridalms/domain/content";
import { plainContent } from "@faridalms/domain/content-conversion";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import {
  client,
  login,
  rejection,
  seeded,
  signedIn,
  testDirectory,
} from "./harness";

const stranger = (network = "198.51.100.20") =>
  client("", undefined, "en", { "x-forwarded-for": network }).identity;

const words = (face: { page: { body: unknown } | null }) =>
  face.page ? contentPlainText(face.page.body as never) : null;

describe("the portal's face", () => {
  test("a stranger sees the school's names, theme and published sign-in page, and nothing else", async () => {
    const face = await stranger().portalFace({
      school: "northwind",
      locale: "en",
    });
    expect(Object.keys(face).toSorted()).toEqual(
      ["logoKey", "name", "page", "school", "theme"].toSorted(),
    );
    expect(face.name).toEqual({
      en: "Northwind International College",
      ar: "كلية نورثويند الدولية",
    });
    expect(face.theme?.id).toBe("meridian");
    expect(words(face)).toContain("Welcome to Northwind");
    const arabic = await stranger().portalFace({
      school: "northwind",
      locale: "ar",
    });
    expect(arabic.page?.locale).toBe("ar");
    expect(words(arabic)).toContain("أهلًا بكم في كلية نورثويند الدولية");
  });

  test("a school that wrote no sign-in page shows none, so the portal draws its own welcome", async () => {
    const face = await stranger().portalFace({
      school: "northwind-east",
      locale: "en",
    });
    expect(face.page).toBeNull();
    expect(face.name.en).toBe("Northwind East School");
  });

  test("a school that does not exist has no face", async () => {
    expect(
      await rejection(
        stranger().portalFace({ school: "nowhere", locale: "en" }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("the sign-in page in the site studio", () => {
  test("edits stay private until they are published, and taking it down restores the default", async () => {
    const api = await signedIn("northwind-east", login("principal", 0, 1));
    const before = await api.site.signInPage();
    expect(before.published).toBe(false);
    expect(before.body).toBeNull();
    expect(await rejection(api.site.publishSignInPage())).toMatchObject({
      code: "CONFLICT",
      message: "site.empty",
    });

    await api.site.saveSignInPage({
      body: plainContent("Welcome to Northwind East. Ask the office for help."),
      translation: plainContent("أهلًا بكم في نورثويند الشرقية."),
    });
    const face = () =>
      stranger().portalFace({ school: "northwind-east", locale: "ar" });
    expect((await face()).page).toBeNull();

    await api.site.publishSignInPage();
    expect(words(await face())).toBe("أهلًا بكم في نورثويند الشرقية.");
    const english = await stranger().portalFace({
      school: "northwind-east",
      locale: "en",
    });
    expect(words(english)).toBe(
      "Welcome to Northwind East. Ask the office for help.",
    );

    await api.site.saveSignInPage({
      body: plainContent("A new welcome nobody has published."),
      translation: plainContent("ترحيب جديد لم يُنشر بعد."),
    });
    expect(words(await face())).toBe("أهلًا بكم في نورثويند الشرقية.");
    expect((await api.site.overview()).signIn).toEqual({
      written: true,
      published: true,
      changed: true,
    });

    await api.site.unpublishSignInPage();
    expect((await face()).page).toBeNull();
    expect((await api.site.signInPage()).published).toBe(false);
  });

  test("a page without a translation shows its original in the other language", async () => {
    const api = await signedIn("acme", login("principal", 1));
    await api.site.saveSignInPage({
      body: plainContent("Welcome to Acme."),
      translation: null,
    });
    await api.site.publishSignInPage();
    const arabic = await stranger().portalFace({
      school: "acme",
      locale: "ar",
    });
    expect(arabic.page?.locale).toBe("en");
    expect(words(arabic)).toBe("Welcome to Acme.");
    await api.site.unpublishSignInPage();
  });

  test("only those who manage the website write the sign-in page", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.site.saveSignInPage({
          body: plainContent("Not mine to write"),
          translation: null,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(await rejection(teacher.site.publishSignInPage())).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("the page is an editor document, so markup and script links are refused", async () => {
    const api = await signedIn("northwind", login("principal"));
    const markup = {
      root: {
        type: "root",
        version: 1,
        children: [
          { type: "html", version: 1, text: "<script>alert(1)</script>" },
        ],
      },
    };
    const scripted = {
      root: {
        type: "root",
        version: 1,
        children: [
          {
            type: "paragraph",
            version: 1,
            children: [
              {
                type: "link",
                version: 1,
                url: "javascript:alert(1)",
                children: [{ type: "text", version: 1, text: "help" }],
              },
            ],
          },
        ],
      },
    };
    for (const body of [markup, scripted])
      expect(
        await rejection(
          api.site.saveSignInPage({ body: body as never, translation: null }),
        ),
      ).toMatchObject({ code: "BAD_REQUEST" });
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
