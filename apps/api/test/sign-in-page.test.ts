import type { PageSection } from "@faridalms/domain/website";

import { newSection } from "@faridalms/domain/website";
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

const visitor = () => client("").site;

const stranger = (network = "198.51.100.20") =>
  client("", undefined, "en", { "x-forwarded-for": network }).identity;

type Face = Awaited<ReturnType<ReturnType<typeof stranger>["portalFace"]>>;

/** The words over the sign-in form, as the face shows them. */
const formHeading = (face: Face) =>
  face.page.sections.find((item) => item.section.type === "signIn")?.section
    .data;

describe("the portal's face", () => {
  test("a stranger sees the school's names, theme, frame and published portal page, and nothing else", async () => {
    const face = await stranger().portalFace({
      school: "northwind",
      locale: "en",
    });
    expect(Object.keys(face).toSorted()).toEqual(
      [
        "contact",
        "frame",
        "logoKey",
        "name",
        "page",
        "school",
        "theme",
        "turnstileKey",
      ].toSorted(),
    );
    expect(face.name).toEqual({
      en: "Northwind International College",
      ar: "كلية نورثويند الدولية",
    });
    expect(face.theme?.id).toBe("meridian");
    expect(face.page.starter).toBe(false);
    expect(formHeading(face)).toMatchObject({
      heading: "Welcome to Northwind International College",
    });
    expect(face.frame?.menu.map((entry) => entry.href)).toContain("/");
    expect(face.frame?.siteHost).toBe("northwind.example.net");
    const arabic = await stranger().portalFace({
      school: "northwind",
      locale: "ar",
    });
    expect(arabic.page.locale).toBe("ar");
    expect(formHeading(arabic)).toMatchObject({
      heading: "أهلًا بكم في كلية نورثويند الدولية",
    });
  });

  test("a school that never published its portal page shows the builder's starter", async () => {
    const face = await stranger().portalFace({
      school: "northwind-east",
      locale: "en",
    });
    expect(face.page.starter).toBe(true);
    expect(formHeading(face)).toMatchObject({ heading: "Sign in" });
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

const signInWords = (section: PageSection, heading: string): PageSection =>
  section.type === "signIn"
    ? { ...section, data: { ...section.data, heading } }
    : section;

describe("the portal page in the site builder", () => {
  test("is a page of the site: edits stay private until published, and it keeps its form", async () => {
    const api = await signedIn("northwind-east", login("principal", 0, 1));
    const before = await api.site.overview();
    expect(before.pages.some((row) => row.kind === "portal")).toBe(false);
    const { id } = await api.site.startPortalPage();
    expect((await api.site.startPortalPage()).id).toBe(id);
    const opened = await api.site.page({ id });
    expect(opened).toMatchObject({ kind: "portal", slug: "sign-in" });
    const save = (
      sections: PageSection[],
      translation: PageSection[] | null,
      version: number,
      extra: { slug?: string; inMenu?: boolean } = {},
    ) =>
      api.site.savePage({
        id,
        expectedVersion: version,
        parentId: "",
        slug: extra.slug ?? "sign-in",
        titleEn: "Sign in",
        titleAr: "تسجيل الدخول",
        inMenu: extra.inMenu ?? false,
        content: { sections, description: "", reviewed: [] },
        translation: translation
          ? { sections: translation, description: "", reviewed: [] }
          : null,
      });
    const form = opened.content.sections.find(
      (section) => section.type === "signIn",
    );
    if (!form) throw new Error("the starter has no sign-in section");
    for (const sections of [
      opened.content.sections.filter((section) => section !== form),
      [...opened.content.sections, { ...form, id: crypto.randomUUID() }],
    ])
      expect(
        await rejection(save(sections, null, opened.version)),
      ).toMatchObject({ code: "BAD_REQUEST", message: "site.system_section" });

    // Northwind East's language is Arabic, so its pages are written in Arabic
    // first and in English beside it.
    const saved = await save(
      opened.content.sections.map((section) =>
        signInWords(section, "أهلًا بكم في نورثويند الشرقية"),
      ),
      (opened.translation?.sections ?? []).map((section) =>
        signInWords(section, "Welcome to Northwind East"),
      ),
      opened.version,
      { slug: "elsewhere", inMenu: true },
    );
    const kept = await api.site.page({ id });
    expect(kept).toMatchObject({ slug: "sign-in", inMenu: false });
    const face = () =>
      stranger().portalFace({ school: "northwind-east", locale: "ar" });
    expect((await face()).page.starter).toBe(true);

    const published = await api.site.publishPage({
      id,
      expectedVersion: saved.version,
      publishAt: "",
    });
    expect(formHeading(await face())).toMatchObject({
      heading: "أهلًا بكم في نورثويند الشرقية",
    });
    expect(
      formHeading(
        await stranger().portalFace({
          school: "northwind-east",
          locale: "en",
        }),
      ),
    ).toMatchObject({ heading: "Welcome to Northwind East" });
    // The website never serves it: it is the portal's.
    expect(
      await rejection(
        visitor().publicSitePage({
          school: "northwind-east",
          locale: "en",
          slug: "sign-in",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    const edited = await save(
      kept.content.sections.map((section) =>
        signInWords(section, "A welcome nobody has published"),
      ),
      null,
      published.version,
    );
    expect(formHeading(await face())).toMatchObject({
      heading: "أهلًا بكم في نورثويند الشرقية",
    });

    for (const refused of [
      api.site.removeSitePage({ id }),
      api.site.movePage({ id, parentId: "", position: 0 }),
    ])
      expect(await rejection(refused)).toMatchObject({
        code: "CONFLICT",
        message: "site.portal_page",
      });

    await api.site.unpublishPage({ id, expectedVersion: edited.version });
    expect((await face()).page.starter).toBe(true);
  });

  test("a page without a translation shows its original in the other language", async () => {
    const api = await signedIn("acme", login("principal", 1));
    const { id } = await api.site.startPortalPage();
    const opened = await api.site.page({ id });
    const saved = await api.site.savePage({
      id,
      expectedVersion: opened.version,
      parentId: "",
      slug: "sign-in",
      titleEn: "Sign in",
      titleAr: "",
      inMenu: false,
      content: {
        sections: opened.content.sections.map((section) =>
          signInWords(section, "Welcome to Acme"),
        ),
        description: "",
        reviewed: [],
      },
      translation: null,
    });
    const published = await api.site.publishPage({
      id,
      expectedVersion: saved.version,
      publishAt: "",
    });
    const arabic = await stranger().portalFace({
      school: "acme",
      locale: "ar",
    });
    expect(arabic.page.sections[0]?.locale).toBe("en");
    expect(formHeading(arabic)).toMatchObject({ heading: "Welcome to Acme" });
    await api.site.unpublishPage({ id, expectedVersion: published.version });
  });

  test("a website page cannot hold the sign-in form", async () => {
    const api = await signedIn("northwind", login("principal"));
    expect(
      await rejection(
        api.site.savePage({
          id: "",
          expectedVersion: 0,
          parentId: "",
          slug: "log-in-here",
          titleEn: "Log in here",
          titleAr: "",
          inMenu: true,
          content: {
            sections: [newSection("signIn")],
            description: "",
            reviewed: [],
          },
          translation: null,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "site.system_section" });
  });

  test("only those who manage the website start the portal page", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    expect(await rejection(teacher.site.startPortalPage())).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("its words are editor documents, so markup and script links are refused", async () => {
    const api = await signedIn("northwind", login("principal"));
    const { id } = await api.site.startPortalPage();
    const opened = await api.site.page({ id });
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
    for (const body of [markup, scripted]) {
      const text = newSection("text");
      expect(
        await rejection(
          api.site.savePage({
            id,
            expectedVersion: opened.version,
            parentId: "",
            slug: "sign-in",
            titleEn: "Sign in",
            titleAr: "",
            inMenu: false,
            content: {
              sections: [
                ...opened.content.sections,
                { ...text, data: { ...text.data, body: body as never } },
              ],
              description: "",
              reviewed: [],
            },
            translation: null,
          }),
        ),
      ).toMatchObject({ code: "BAD_REQUEST" });
    }
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
