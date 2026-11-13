import { createHash } from "node:crypto";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ModuleId } from "./modules";
import type { SiteModules, StarterId } from "./site-templates";
import type { PageContent, PageSection, SectionOf } from "./website";

import { plainContent } from "./content-conversion";
import { MODULE_IDS } from "./modules";
import {
  fitColumns,
  MAX_PLAN_POINTS,
  MAX_PLANS,
  overlay,
  planPoints,
  SECTION_SPECS,
  SECTION_TYPES,
  sectionComplete,
  sectionIssues,
  sectionWords,
  shownFields,
} from "./site-sections";
import {
  buildSection,
  buildStarter,
  buildTemplate,
  PAGE_TEMPLATE_IDS,
  siteModules,
  STARTER_IDS,
  starterChrome,
  STARTERS,
} from "./site-templates";
import {
  artPalette,
  contrast,
  darkBands,
  darkPalette,
  DISTINCT_INK,
  fromOklch,
  inkDistance,
  resolveTheme,
  schemesOf,
  THEME_IDS,
  THEMES,
  toOklch,
} from "./site-theme";
import {
  alignTranslation,
  blankPage,
  isSiteHref,
  localizedSections,
  newSection,
  pageContentSchema,
  pageFileIds,
  pageIssues,
  pageSectionSchema,
  pageWarnings,
  saveRedirectSchema,
  translationGaps,
  wordless,
} from "./website";

const picture = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b44";

function hero(heading: string, alt: string, label: string): SectionOf<"hero"> {
  const section = newSection("hero");
  return {
    ...section,
    id: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b41",
    data: {
      ...section.data,
      heading,
      media: {
        kind: "image",
        fileId: picture,
        alt,
        posterFileId: null,
        captionsFileId: null,
      },
      actions: [
        {
          id: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b42",
          label,
          href: "/pages/admissions",
        },
      ],
    },
  };
}

function withFocus(section: SectionOf<"hero">, x: number, y: number) {
  return {
    ...section,
    data: {
      ...section.data,
      media: { ...section.data.media, focus: { x, y } },
    },
  };
}

function cards(): PageSection {
  const section = newSection("cards");
  return {
    ...section,
    id: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b45",
    data: {
      ...section.data,
      heading: "Explore",
      items: [
        {
          id: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b46",
          title: "Clubs",
          text: "After school",
          image: { fileId: null, alt: "" },
          icon: "star",
          href: "/pages/clubs",
        },
      ],
    },
  };
}

const english: PageContent = blankPage([
  hero("Welcome", "The front gate", "Apply now"),
  cards(),
]);

describe("sections", () => {
  it("validate against their declaration, including every type's first layout", () => {
    for (const section of english.sections)
      expect(v.safeParse(pageSectionSchema, section).success).toBe(true);
    expect(
      v.safeParse(pageSectionSchema, {
        ...english.sections[0],
        variant: "sideways",
      }).success,
    ).toBe(false);
  });

  it("keep a picture's focal point, within the picture", () => {
    const section = hero("Welcome", "The front gate", "Apply now");
    const focused = (focus: unknown) => ({
      ...section,
      data: { ...section.data, media: { ...section.data.media, focus } },
    });
    const parsed = v.parse(pageSectionSchema, focused({ x: 30, y: 20 }));
    expect(parsed.data).toMatchObject({ media: { focus: { x: 30, y: 20 } } });
    expect(
      v.safeParse(pageSectionSchema, focused({ x: 101, y: 20 })).success,
    ).toBe(false);
    expect(
      v.safeParse(pageSectionSchema, focused({ x: 12.5, y: 20 })).success,
    ).toBe(false);
  });
});

describe("the other language of a page", () => {
  it("keeps the original's pictures, links and layout and takes only the words", () => {
    const [original] = english.sections;
    if (!original || original.type !== "hero") throw new Error("hero");
    const arabic = hero("أهلًا", "البوابة", "قدّم الآن");
    const translated = {
      ...arabic,
      variant: "type",
      data: { ...arabic.data, media: { ...arabic.data.media, fileId: null } },
    } as PageSection;
    const aligned = alignTranslation(english, {
      ...blankPage([translated]),
      reviewed: [original.id, "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b45"],
    });
    const [first] = aligned.sections;
    expect(first?.variant).toBe("fullbleed");
    expect(first?.data).toMatchObject({
      heading: "أهلًا",
      media: { fileId: picture, alt: "البوابة" },
      actions: [{ label: "قدّم الآن", href: "/pages/admissions" }],
    });
    expect(aligned.reviewed).toEqual([original.id]);
    expect(translationGaps(english, aligned)).toEqual({
      missing: ["0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b45"],
      unreviewed: [],
    });
  });

  it("frames the picture on the original's focal point", () => {
    const original = withFocus(hero("Welcome", "The gate", "Apply"), 30, 70);
    const translated = withFocus(hero("أهلًا", "البوابة", "قدّم"), 0, 0);
    expect(overlay(original, translated).data).toMatchObject({
      heading: "أهلًا",
      media: { alt: "البوابة", focus: { x: 30, y: 70 } },
    });
  });

  it("shows a missing or half-translated section in the original language", () => {
    const [first, second] = english.sections;
    if (!first || !second) throw new Error("sections");
    const partial = wordless(second);
    const shown = localizedSections(
      english,
      {
        sections: [
          first,
          {
            ...partial,
            data: { ...partial.data, heading: "استكشف" },
          } as PageSection,
        ],
        description: "",
        socialPicture: { fileId: null, alt: "" },
        canonical: "",
        reviewed: [],
      },
      "en",
      "ar",
    );
    expect(shown.map((entry) => entry.locale)).toEqual(["ar", "en"]);
  });
});

describe("checks before publishing", () => {
  it("want a description for every picture and words that say where a button goes", () => {
    const sections = [hero("", " ", "Click here")];
    expect(
      pageIssues(sections)
        .map((issue) => issue.code)
        .toSorted(),
    ).toEqual(["alt", "link"]);
    const text = {
      ...newSection("text"),
      data: { eyebrow: "", heading: "", body: plainContent("Fine words") },
    } as PageSection;
    expect(pageIssues([text])).toEqual([]);
  });

  it("accept paths inside the site and safe addresses, nothing else", () => {
    expect(isSiteHref("/pages/about")).toBe(true);
    expect(isSiteHref("https://example.com/a")).toBe(true);
    expect(isSiteHref("javascript:alert(1)")).toBe(false);
    expect(isSiteHref("/Pages/../x")).toBe(false);
  });

  it("warn of a language without a search description, and never block", () => {
    const described = { ...english, description: "Our school" };
    expect(pageWarnings(described, null, ["en"], "en")).toEqual([]);
    expect(pageWarnings(described, blankPage(), ["en", "ar"], "en")).toEqual([
      { locale: "ar", code: "description" },
    ]);
    expect(pageWarnings(english, null, ["en", "ar"], "en")).toEqual([
      { locale: "en", code: "description" },
      { locale: "ar", code: "description" },
    ]);
    expect(pageIssues(english.sections)).toEqual([]);
  });
});

const withCanonical = (canonical: string) =>
  v.safeParse(pageContentSchema, { ...english, canonical }).success;

describe("how a page presents itself outside the site", () => {
  it("reads content saved before it had a social picture or canonical address", () => {
    const saved = v.parse(pageContentSchema, {
      sections: [],
      description: "Old",
    });
    expect(saved.socialPicture).toEqual({ fileId: null, alt: "" });
    expect(saved.canonical).toBe("");
  });

  it("publishes the social picture with the page's other files", () => {
    const shared = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b99";
    expect(
      pageFileIds({ ...english, socialPicture: { fileId: shared, alt: "" } }),
    ).toEqual([picture, shared]);
  });

  it("takes a canonical address on the site or elsewhere, and nothing else", () => {
    expect(withCanonical("/pages/about")).toBe(true);
    expect(withCanonical("https://example.com/about")).toBe(true);
    expect(withCanonical("javascript:alert(1)")).toBe(false);
    expect(withCanonical("about")).toBe(false);
  });
});

const redirectInput = (input: Record<string, unknown>) =>
  v.safeParse(saveRedirectSchema, {
    id: "",
    expectedVersion: 0,
    toPageId: "",
    toUrl: "",
    ...input,
  });

describe("redirects", () => {
  const page = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b77";

  it("keep the old address as it will be matched", () => {
    const parsed = redirectInput({ from: "/About-Us/?x=1", toPageId: page });
    expect(parsed.success && parsed.output.from).toBe("/about-us");
  });

  it("lead to exactly one page or address", () => {
    expect(redirectInput({ from: "/old", toUrl: "/pages/new" }).success).toBe(
      true,
    );
    expect(
      redirectInput({ from: "/old", toUrl: "https://example.com" }).success,
    ).toBe(true);
    expect(redirectInput({ from: "/old" }).success).toBe(false);
    expect(
      redirectInput({ from: "/old", toPageId: page, toUrl: "/pages/new" })
        .success,
    ).toBe(false);
  });

  it("never take over the home page or a non-path", () => {
    expect(redirectInput({ from: "/", toPageId: page }).success).toBe(false);
    expect(redirectInput({ from: "old", toPageId: page }).success).toBe(false);
  });
});

describe("themes", () => {
  it("give every scheme of every theme readable text and visible buttons", () => {
    for (const id of THEME_IDS) {
      const schemes = schemesOf(THEMES[id].palette);
      for (const scheme of Object.values(schemes)) {
        expect(contrast(scheme.body, scheme.background)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrast(scheme.buttonText, scheme.button),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keep every theme readable on a dark screen in the school's own hue", () => {
    for (const id of THEME_IDS) {
      const { palette } = THEMES[id];
      const dark = darkPalette(palette);
      const schemes = schemesOf(dark);
      for (const scheme of Object.values(schemes)) {
        expect(contrast(scheme.body, scheme.background)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrast(scheme.buttonText, scheme.button),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keep a coloured brand's hue when lifting it for a dark screen", () => {
    const coloured = THEME_IDS.filter(
      (id) => toOklch(THEMES[id].palette.primary).c >= 0.035,
    );
    expect(coloured.length).toBeGreaterThan(0);
    for (const id of coloured) {
      const { palette } = THEMES[id];
      const lifted = toOklch(darkPalette(palette).primary);
      expect(Math.abs(lifted.h - toOklch(palette.primary).h)).toBeLessThan(6);
    }
  });

  it("give canvas and soft sections a button colour that also reads as text", () => {
    // Shared app components drawn in a section (the editor's reader, its links)
    // use the button colour for their links too.
    for (const id of THEME_IDS)
      for (const palette of [
        THEMES[id].palette,
        darkPalette(THEMES[id].palette),
      ]) {
        const schemes = schemesOf(palette);
        for (const scheme of [schemes.canvas, schemes.soft])
          expect(
            contrast(scheme.button, scheme.background),
          ).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("turn a black brand white on a dark screen, never a mid grey", () => {
    const dark = darkPalette({ ...THEMES.editorial.palette });
    expect(toOklch(dark.primary).l).toBeGreaterThan(0.9);
  });

  it("keep a black brand's band near-black on a dark screen, edged rather than grey", () => {
    const { palette } = THEMES.editorial;
    const bands = darkBands(palette);
    const page = darkPalette(palette).canvas;
    expect(toOklch(bands.primary).l).toBeLessThan(0.3);
    expect(toOklch(bands.primary).l).toBeGreaterThan(toOklch(page).l);
    expect(toOklch(bands.ink).l).toBeLessThan(toOklch(page).l);
    expect(bands.edged).toEqual({ primary: true, ink: true });
  });

  it("keep a coloured brand's band in its colour, apart from the dark page", () => {
    const { palette } = THEMES.meridian;
    const bands = darkBands(palette);
    const page = darkPalette(palette).canvas;
    expect(contrast(bands.primary, page)).toBeGreaterThanOrEqual(1.3);
    expect(bands.edged.primary).toBe(false);
    expect(
      Math.abs(toOklch(bands.primary).h - toOklch(palette.primary).h),
    ).toBeLessThan(6);
  });

  it("tint tiles in the link's own hue, never a grey, on every section", () => {
    for (const id of THEME_IDS)
      for (const palette of [
        THEMES[id].palette,
        darkPalette(THEMES[id].palette),
      ])
        for (const scheme of Object.values(schemesOf(palette))) {
          const link = toOklch(scheme.link);
          if (link.c < 0.035) continue;
          const tint = toOklch(scheme.tint);
          expect(tint.c).toBeGreaterThan(0.02);
          const apart = Math.abs(tint.h - link.h) % 360;
          expect(Math.min(apart, 360 - apart)).toBeLessThan(8);
        }
  });

  it("mark Arabic's emphasis in a colour that reads and parts from the heading", () => {
    let coloured = 0;
    for (const id of THEME_IDS)
      for (const palette of [
        THEMES[id].palette,
        darkPalette(THEMES[id].palette),
      ])
        for (const scheme of Object.values(schemesOf(palette))) {
          if (scheme.standout === null) continue;
          coloured += 1;
          expect(
            contrast(scheme.standout, scheme.background),
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            inkDistance(scheme.standout, scheme.heading),
          ).toBeGreaterThanOrEqual(DISTINCT_INK);
        }
    // Only a band of a colour no other reads on falls back to weight.
    expect(coloured).toBeGreaterThanOrEqual(THEME_IDS.length * 2 * 5 - 4);
  });

  it("give an italic theme with a brand as dark as its ink an Arabic accent", () => {
    const { palette } = THEMES.atelier;
    for (const scheme of [schemesOf(palette).canvas, schemesOf(palette).soft]) {
      expect(scheme.standout).not.toBeNull();
      expect(inkDistance(scheme.link, scheme.heading)).toBeLessThan(
        DISTINCT_INK,
      );
    }
  });

  it("raise cards above a dark background rather than sink them", () => {
    for (const id of THEME_IDS) {
      const soft = schemesOf(darkPalette(THEMES[id].palette)).soft;
      expect(toOklch(soft.card).l).toBeGreaterThan(toOklch(soft.background).l);
    }
  });

  it("draw artwork deep enough for white words in every theme", () => {
    for (const id of THEME_IDS)
      expect(
        contrast("#FFFFFF", artPalette(THEMES[id].palette).deep),
      ).toBeGreaterThanOrEqual(7);
  });

  it("convert to OKLCH and back without drift", () => {
    for (const colour of ["#0B3D91", "#F5C400", "#101010", "#C8643B"])
      expect(fromOklch(toOklch(colour))).toBe(colour.toLowerCase());
  });

  it("layer a school's choices over its theme", () => {
    const theme = resolveTheme({
      id: "heritage",
      palette: { primary: "#003366" },
      fonts: {},
      radius: 8,
    });
    expect(theme.palette.primary).toBe("#003366");
    expect(theme.palette.canvas).toBe(THEMES.heritage.palette.canvas);
    expect(theme.radius).toBe(8);
    expect(theme.header).toBe("centered");
  });
});

/** Every link target anywhere in a value, however deeply nested. */
function hrefs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(hrefs);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    key === "href" && typeof inner === "string" ? [inner] : hrefs(inner),
  );
}

/** Every sentence a visitor reads in a value, leaving out what a person is quoted as saying. */
function words(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(words);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    key === "quote" ? [] : words(inner),
  );
}

const EVERY = siteModules(MODULE_IDS);
const without = (...off: ModuleId[]) =>
  siteModules(MODULE_IDS.filter((module) => !off.includes(module)));

/** The schools a starter is built for in these tests, by what they lack. */
const SCHOOLS: Record<string, SiteModules> = {
  "every module": EVERY,
  "no admissions": without("admissions"),
  "no families": without("families"),
  "no admissions or families": without("admissions", "families"),
  "no grade levels": without("grade_levels"),
  "no admissions, families or grade levels": without(
    "admissions",
    "families",
    "grade_levels",
  ),
};

/** The five starters written for a school of children, older than those for courses. */
const SCHOOL_STARTERS = [
  "heritage",
  "international",
  "earlyYears",
  "arabicFirst",
  "launch",
] as const satisfies readonly StarterId[];

/** The pages of those starters a school keeps whatever its modules. */
const KEPT_PAGES = new Set(["home", "about", "academics", "visit", "contact"]);

const FAMILY_WORDS =
  /\b(famil(y|ies)|parents?|guardians?|child(ren)?('s)?|siblings?|brothers?|sisters?)\b|أسرة|أسرت|الأسر|لأسر|بأسر|أسرنا|صغيركم|أولياء|ولي الأمر|وليّ أمر|والدين|طفل|أطفالكم|أطفالنا|أبناء|إخوة/i;
/** A grade as a level of school, not as a mark. */
const GRADE_WORDS =
  /\b(grade \d+|grade levels?|year groups?|each grade)\b|the year (they|your child) would join|الصف (الأول|الثاني|العاشر|الذي)|بالصف|كل صف/i;

/** A starter's sentences on the pages every school keeps, in one language. */
function keptWords(built: ReturnType<typeof buildStarter>, first: boolean) {
  return built.pages
    .filter(({ plan }) => KEPT_PAGES.has(plan.slug))
    .flatMap(({ built: page }) =>
      words(first ? page.content : page.translation)
        // A stage of school, named the same with or without families.
        .map((text) => text.replaceAll("رياض الأطفال", "")),
    );
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** A value with its keys in order, so two builds compare by their structure. */
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .toSorted(([a], [b]) => (a < b ? -1 : 1))
            .map(([key, inner]) => [key, canonical(inner)]),
        )
      : value;

const slugs = (starter: StarterId, modules: SiteModules) =>
  buildStarter(STARTERS[starter], "en", modules).pages.map(
    ({ plan }) => plan.slug,
  );

const types = (modules: SiteModules) =>
  buildTemplate("homeStory", "en", modules).content.map((row) => row.type);

const labels = (starter: StarterId, modules: SiteModules) =>
  buildStarter(STARTERS[starter], "en", modules).chrome.actions.map(
    (action) => [action.label.en, action.label.ar, action.href],
  );

/** What each form of a starter asks that the school's modules do not let it. */
function overAsked(starter: StarterId, modules: SiteModules) {
  return buildStarter(STARTERS[starter], "en", modules).pages.flatMap(
    ({ built }) =>
      [...built.content, ...built.translation].flatMap((row) =>
        row.type === "form"
          ? [
              ...(modules.families || row.data.child === "hide"
                ? []
                : ["child"]),
              ...(modules.grade_levels || row.data.grade === "hide"
                ? []
                : ["grade"]),
            ]
          : [],
      ),
  );
}

/** A starter's sentences on the kept pages that name a module the school does not have. */
function unearned(starter: StarterId, modules: SiteModules) {
  const built = buildStarter(STARTERS[starter], "en", modules);
  return [true, false].flatMap((first) =>
    keptWords(built, first).filter(
      (text) =>
        (!modules.families && FAMILY_WORDS.test(text)) ||
        (!modules.grade_levels && GRADE_WORDS.test(text)),
    ),
  );
}

describe("templates", () => {
  it("build valid sections in both languages that line up as a translation", () => {
    for (const modules of Object.values(SCHOOLS))
      for (const template of PAGE_TEMPLATE_IDS) {
        const { content, translation } = buildTemplate(template, "en", modules);
        expect(translation.map((row) => row.id)).toEqual(
          content.map((row) => row.id),
        );
        for (const row of [...content, ...translation])
          expect(v.safeParse(pageSectionSchema, row).success).toBe(true);
        const gaps = translationGaps(
          blankPage(content),
          blankPage(translation),
        );
        expect(gaps.missing).toEqual([]);
      }
  });

  it("offer a sample of every section in every layout, aligned in both languages", () => {
    for (const type of SECTION_TYPES)
      for (const variant of SECTION_SPECS[type].variants) {
        const { content, translation } = buildSection(
          type,
          variant as never,
          "ar",
        );
        expect(content.variant).toBe(variant);
        expect(translation.id).toBe(content.id);
        for (const row of [content, translation])
          expect(v.safeParse(pageSectionSchema, row).success).toBe(true);
      }
  });

  it("link only to pages the starter creates", () => {
    for (const modules of Object.values(SCHOOLS))
      for (const starter of STARTER_IDS) {
        const { pages, chrome } = buildStarter(
          STARTERS[starter],
          "en",
          modules,
        );
        const known = new Set([
          "",
          "/",
          "/news",
          ...pages.map(({ plan }) => `/pages/${plan.slug}`),
        ]);
        const anchors = new Map(
          pages.map(({ plan, built }) => [
            `/pages/${plan.slug}`,
            new Set(built.content.map((row) => row.style.anchor)),
          ]),
        );
        const linked = [
          ...pages.flatMap(({ built }) => [
            ...hrefs(built.content),
            ...hrefs(built.translation),
          ]),
          ...hrefs(chrome),
        ];
        const dead = linked.filter((href) => {
          const [path = "", anchor] = href.split("#");
          if (!known.has(path)) return true;
          return anchor !== undefined && !anchors.get(path)?.has(anchor);
        });
        expect(dead).toEqual([]);
      }
  });

  it("build every school starter for a school with every module exactly as before modules were weighed", () => {
    const built = SCHOOL_STARTERS.map((id) => {
      const { pages, chrome } = buildStarter(STARTERS[id], "en", EVERY);
      return {
        id,
        pages: pages.map(({ plan }) => ({
          slug: plan.slug,
          title: plan.title,
          en: buildStarter(STARTERS[id], "en", EVERY).pages.find(
            (page) => page.plan.slug === plan.slug,
          )?.built,
          ar: buildStarter(STARTERS[id], "ar", EVERY).pages.find(
            (page) => page.plan.slug === plan.slug,
          )?.built,
        })),
        chrome,
      };
    });
    const text = JSON.stringify(canonical(built)).replace(UUID, "<id>");
    // The digest of what every school starter built, ids aside, before a
    // starter followed the school's modules.
    expect(createHash("sha256").update(text).digest("hex")).toBe(
      "887919bf24268ed5d9c5cd6d4a225497c370acb97c565184f070d5ca09fcdc00",
    );
  });

  it("build a school without a page's modules without the page", () => {
    expect(slugs("international", EVERY)).toEqual([
      "home",
      "about",
      "academics",
      "admissions",
      "visit",
      "parents",
      "contact",
    ]);
    expect(slugs("international", without("families"))).not.toContain(
      "parents",
    );
    expect(slugs("international", without("admissions", "families"))).toEqual([
      "home",
      "about",
      "academics",
      "visit",
      "contact",
    ]);
    expect(slugs("reel", without("admissions", "families"))).toEqual(
      slugs("reel", EVERY),
    );
  });

  it("leave out a section whose module, or whose words' modules, the school does not have", () => {
    expect(types(EVERY)).toEqual(
      expect.arrayContaining(["voices", "registerApply"]),
    );
    expect(types(without("admissions"))).not.toContain("registerApply");
    expect(types(without("families"))).not.toContain("voices");
  });

  it("give the header today's three buttons with admissions, and one way to write without", () => {
    expect(labels("heritage", EVERY)).toEqual([
      ["Enquire", "استفسر", "/pages/admissions#enquire"],
      ["Book a visit", "احجز زيارة", "/pages/visit#book-a-visit"],
      ["Apply", "قدّم الآن", "/pages/admissions#apply"],
    ]);
    for (const starter of SCHOOL_STARTERS)
      expect(labels(starter, without("admissions"))).toEqual([
        ["Get in touch", "تواصل معنا", "/pages/contact"],
      ]);
    expect(labels("reel", without("admissions"))).toEqual(
      labels("reel", EVERY),
    );
  });

  it("give a starter its own header buttons where it names them", () => {
    const { pages, actions } = STARTERS.reel;
    const chrome = starterChrome(pages, EVERY, actions);
    expect(chrome.actions.map((action) => action.label.en)).toEqual([
      "Start watching",
    ]);
    expect(chrome.actions[0]?.href).toBe("/pages/courses");
    expect(
      starterChrome(STARTERS.heritage.pages, EVERY).actions.map(
        (action) => action.label.en,
      ),
    ).toEqual(["Enquire", "Book a visit", "Apply"]);
  });

  it("ask for a child only with families and a grade only with grade levels", () => {
    for (const [name, modules] of Object.entries(SCHOOLS))
      for (const starter of STARTER_IDS)
        expect(overAsked(starter, modules), `${starter}, ${name}`).toEqual([]);
  });

  it("speak of families and grades only to a school that has them", () => {
    for (const [name, modules] of Object.entries(SCHOOLS))
      for (const starter of SCHOOL_STARTERS)
        expect(unearned(starter, modules), `${starter}, ${name}`).toEqual([]);
  });

  it("speak to learners, not to families, in the starters for courses", () => {
    const schoolWords =
      /\b(famil(y|ies)|parents?|guardians?|child(ren)?|grades?|homerooms?)\b|أسرة|الأسر|أولياء|ولي الأمر|طفلكم|أطفالكم/i;
    for (const starter of ["workshop", "atelier", "reel"] as const)
      for (const page of STARTERS[starter].pages)
        for (const language of ["en", "ar"] as const) {
          // A parent may speak in a quote; the page itself addresses the learner.
          const said = words(
            buildTemplate(page.template, language, EVERY).content,
          );
          expect(said.filter((text) => schoolWords.test(text))).toEqual([]);
        }
  });

  it("give every starter a home page and a theme", () => {
    for (const starter of STARTER_IDS) {
      expect(STARTERS[starter].pages.filter((page) => page.home)).toHaveLength(
        1,
      );
      expect(THEME_IDS).toContain(STARTERS[starter].theme);
    }
  });
});

describe("free-form blocks", () => {
  it("translate block by block, keeping the original's pictures and layout", () => {
    const { content, translation } = buildSection("blocks", "columns", "en");
    if (content.type !== "blocks" || translation.type !== "blocks")
      throw new Error("blocks");
    const pictured = (decorative: boolean) => ({
      ...content,
      data: {
        ...content.data,
        columns: content.data.columns.map((column) => ({
          ...column,
          blocks: column.blocks.map((block) =>
            block.type === "image"
              ? {
                  ...block,
                  data: {
                    ...block.data,
                    image: { fileId: picture, alt: "", decorative },
                  },
                }
              : block,
          ),
        })),
      },
    });
    const withPicture = pictured(false);
    expect(sectionIssues(withPicture)).toContain("alt");
    // A picture that only decorates has nothing to describe.
    expect(sectionIssues(pictured(true))).not.toContain("alt");
    const shown = overlay(withPicture, translation);
    if (shown.type !== "blocks") throw new Error("blocks");
    const blocks = shown.data.columns.flatMap((column) => column.blocks);
    const heading = blocks.find((block) => block.type === "heading");
    const image = blocks.find((block) => block.type === "image");
    expect(heading?.type === "heading" && heading.data.text).toBe(
      "فصول صغيرة وطموحات *كبيرة*",
    );
    expect(image?.type === "image" && image.data.image.fileId).toBe(picture);
  });

  it("move the blocks of dropped columns into the last one kept", () => {
    const { content } = buildSection("blocks", "columns", "en");
    if (content.type !== "blocks") throw new Error("blocks");
    const count = content.data.columns.flatMap(
      (column) => column.blocks,
    ).length;
    const one = fitColumns(content.data.columns, "1");
    expect(one).toHaveLength(1);
    expect(one[0]?.blocks).toHaveLength(count);
    expect(fitColumns(content.data.columns, "1-1-1-1")).toHaveLength(4);
  });
});

/** The items a section's inspector shows for its layout: how many, and which fields. */
const itemFields = (section: PageSection) => {
  const items = shownFields(section).find(([key]) => key === "items")?.[1];
  return items?.kind === "items"
    ? { max: items.max, fields: Object.keys(items.fields) }
    : null;
};

describe("plan cards", () => {
  it("are a layout of fees whose items carry points, a mark and a button only there", () => {
    expect(SECTION_SPECS.fees.variants).toContain("plans");
    const plans = buildSection("fees", "plans", "en").content;
    expect(itemFields(plans)).toEqual({
      max: MAX_PLANS,
      fields: ["label", "value", "note", "includes", "mark", "link"],
    });
    expect(itemFields({ ...plans, variant: "table" } as PageSection)).toEqual({
      max: 30,
      fields: ["label", "value", "note"],
    });
  });

  it("have sample plans in both languages that line up, one most chosen, each with a button", () => {
    const { content, translation } = buildSection("fees", "plans", "ar");
    for (const section of [content, translation]) {
      expect(v.parse(pageSectionSchema, section)).toEqual(section);
      expect(sectionIssues(section)).toEqual([]);
      if (section.type !== "fees") throw new Error("not fees");
      const items = section.data.items;
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items.length).toBeLessThanOrEqual(MAX_PLANS);
      expect(items.filter((item) => item.mark === "chosen")).toHaveLength(1);
      for (const item of items) {
        expect(item.link?.[0]?.label).not.toBe("");
        expect(planPoints(item.includes ?? "").length).toBeGreaterThan(0);
      }
    }
    expect(sectionComplete(content, translation)).toBe(true);
  });

  it("list a plan's points one to a line, trimmed, once each and at most six", () => {
    expect(planPoints(" One \n\nTwo\nOne\n3\n4\n5\n6\n7")).toEqual(
      ["One", "Two", "3", "4", "5", "6"].slice(0, MAX_PLAN_POINTS),
    );
  });

  it("read a fee saved before plans existed with a plan's fields at their initial values", () => {
    const saved = {
      id: crypto.randomUUID(),
      type: "fees",
      variant: "table",
      data: {
        heading: "Fees",
        text: "",
        items: [
          { id: crypto.randomUUID(), label: "Tuition", value: "—", note: "" },
        ],
      },
    };
    const parsed = v.parse(pageSectionSchema, saved);
    expect(parsed.data).toMatchObject({
      items: [{ label: "Tuition", includes: "", mark: "plain", link: [] }],
    });
    expect(sectionWords(saved as unknown as PageSection)).toContain("Tuition");
    expect(
      overlay(saved as unknown as PageSection, saved as unknown as PageSection),
    ).toMatchObject({ data: { items: [{ includes: "", link: [] }] } });
  });

  it("price the video courses starter, its plan by the month most chosen", () => {
    const { pages } = buildStarter(
      STARTERS.reel,
      "en",
      siteModules(MODULE_IDS),
    );
    const pricing = pages
      .find((page) => page.plan.slug === "pricing")
      ?.built.content.find((section) => section.type === "fees");
    if (pricing?.type !== "fees") throw new Error("no pricing");
    expect(pricing.variant).toBe("plans");
    expect(pricing.data.items.map((item) => [item.label, item.mark])).toEqual([
      ["One course", "plain"],
      ["Everything, by the month", "chosen"],
    ]);
  });
});
